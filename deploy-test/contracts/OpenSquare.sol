// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.7.0;

import { VerifyVDF } from "./VerifyVDF.sol";

/// @title Voting with delegation.
contract OpenSquaring is VerifyVDF {

    struct OpenedResponse {
        bytes32 data;
        uint256 price;
    }

    struct ClosedResponse {
        bytes32 data;
        uint256 nonce;
        uint256 ell;
        bytes32 asking_price_hash;
    }

    struct Request {
        // The address requesting solution for this puzzle
        address payable client;
        // The encoded for of the request (g,T,N)
        // TODO: Store only the hash, and provide it as calldata when needed 
        bytes g;
        uint256 T;

        // TIMES: All times are in terns of block numbers
        // t_sol: All solutions must be posted within this time, also submit hash of bid at this time
        uint256 solve_time;
        // t_complain: All complaints against solutions must be posted within this time
        uint256 complaint_time;
        // t_ask: All bids must be opened by this time
        uint256 asking_time;
        // t_refund: The client can claim any remaining money after this time
        // Solvers must claim their rewards before this time
        uint256 refund_time;

        // REWARDS (in Wei)
        // The number of solvers who will be rewarded
        uint256 k; 
        // p: Total prize for all the winners
        uint256 p;
        // money left after claiming
        uint256 money_left;

        // COLLATERALS TO BE DEPOSITED
        // The amount of money that needs to be paid by a solver when posting a solution. If the solver is not within the k best bids, this amount will be returned. Otherwise, R/k + solution_collateral will be returned.
        // ENSURE THAT THIS IS GREATER THAN THE COST TO COMPLAIN AGAINST AN INVALID PUZZLE
        uint256 solution_collateral;

        // Maintain a list of opened responses that are always in increasing order
        OpenedResponse[] opened;
        // The list of all the responses, the response id is the position in the array
        mapping (address => ClosedResponse) closed;

        // A request needs to be loaded in stages
        uint8 stage;
    }
    uint256 NumRequest;

    // Map NumRequest counter to the request
    mapping (uint256 => Request) active_puzzles;
    mapping (address => uint256) bank;

    function NewRequest_p1(uint256 solve_time, uint256 complaint_time, 
        uint256 asking_time, uint256 refund_time,
        uint256 k, uint256 p,
        uint256 solution_collateral
    ) 
        public payable 
    {
        require(msg.value == p, "Insuffient funds");
        require(complaint_time > solve_time, "T_comp < T_solv");
        require(asking_time > complaint_time, "T_ask < T_comp");
        require(refund_time > asking_time, "T_refund < T_ask");
        // Generate request ID, use a counter to generate the ID instead of an expensive hash
        uint req_id = NumRequest++;
        Request storage req = active_puzzles[req_id]; 
        req.client = payable(msg.sender);
        req.solve_time = solve_time;
        req.complaint_time = complaint_time;
        req.asking_time = asking_time;
        req.refund_time = refund_time;
        req.k = k;
        req.p = p;
        req.money_left = p;
        req.solution_collateral = solution_collateral;
        bank[msg.sender] += msg.value;
        req.stage = 1;
    }

    function NewRequest_p2(bytes calldata g, uint256 T, uint256 req_id) 
        public payable
    {
        Request storage req = active_puzzles[req_id];
        require(req.client == msg.sender, "Invalid sender");
        require(req.stage == 1, "Invalid stage");

        req.g = g;
        req.T = T;
        req.stage = 2;
        req.solve_time += block.number;
        req.complaint_time += block.number;
        req.asking_time += block.number;
        req.refund_time += block.number;
    }

    function SubmitSolution(uint256 req_id, bytes32 asking_price_hash,
        uint256 ell, uint256 nonce, 
        bytes memory pi1, bytes memory pi2,
        bytes memory y1, bytes memory y2,
        bytes memory q1, bytes memory q2
    ) public payable 
    {
        Request storage req = active_puzzles[req_id];
        require(req.client != payable(0), "Invalid reqid");
        require(req.stage == 2, "Invalid stage");
        require(msg.value == req.solution_collateral, "Incorrect collateral");
        require(block.number <= req.solve_time, "Insufficient solve time");
        // Things you have to do to avoid the stack too deep problems
        bytes32 data1 = keccak256(abi.encodePacked(y1,y2));
        bytes32 data2 = keccak256(abi.encodePacked(y1,pi1,q1));
        bytes32 data3 = keccak256(abi.encodePacked(y2,pi2,q2));
        bytes32 data = keccak256(abi.encodePacked(data1,data2,data3,msg.sender));
        ClosedResponse storage response = req.closed[msg.sender];
        response.nonce = nonce;
        response.ell = ell;
        response.asking_price_hash = asking_price_hash;
        response.data = data;
        // This msg.sender may be holding on to some other money from other puzzles
        bank[msg.sender] += req.solution_collateral;
        // The response ID is (req_id, msg.sender)
    }

    // DEBUG: TODO DELETE
    function getTime(uint256 req_id) public view returns (uint256 v1, uint256 v2, uint256 v3, uint256 v4) {
        v1 = active_puzzles[req_id].solve_time;
        v2 = active_puzzles[req_id].complaint_time;
        v3 = active_puzzles[req_id].asking_time;
        v4 = active_puzzles[req_id].refund_time;
    }

    function Ask(uint256 req_id, uint256 asking_price, uint256 nonce) public {
        Request storage req = active_puzzles[req_id];
        require(req.client != address(0), "Invalid reqid");
        require(block.number > req.complaint_time, "Complaint time not over");
        require(block.number <= req.asking_time, "asking time over");
        
        ClosedResponse storage resp = req.closed[msg.sender];
        require(keccak256(abi.encodePacked(asking_price, nonce))==
            resp.asking_price_hash, "hash is not matching");

        OpenedResponse memory ask;
        ask.data = resp.data;
        ask.price = asking_price;

        // Bubble sort
        if (req.opened.length == 0) {
            // No matter what the position is, insert it at the beginning
            req.opened.push(ask);
        } else if (req.opened.length == 1) {
            if (req.opened[0].price < asking_price) {
                req.opened.push(ask);
            } else {
                OpenedResponse memory temp = req.opened[0];
                req.opened[0] = ask;
                req.opened.push(temp); 
            }
        } else if (asking_price >= req.opened[req.opened.length-1].price) {
            req.opened.push(ask);
        } else if (asking_price < req.opened[0].price) {
            OpenedResponse memory temp = ask;
            OpenedResponse memory temp2;
            for(uint i=0;i<req.opened.length;i++) {
                temp2 = req.opened[i];
                req.opened[i] = temp;
                temp = temp2;
            }
            req.opened.push(temp);
        } else {
            for(uint i=1; i<req.opened.length; i++) {
                if (asking_price < req.opened[i].price && asking_price > req.opened[i].price) {
                    OpenedResponse memory temp = ask;
                    OpenedResponse memory temp2;
                    for(uint j=i;j<req.opened.length;j++) {
                        temp2 = req.opened[j];
                        req.opened[j] = temp;
                        temp = temp2;
                    }
                    break;
                }
            }
        }
    }

    function view_intermediate_hash1(bytes memory y1, bytes memory y2) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(y1,y2));
    }

    function view_intermediate_hash2_3(bytes memory y, bytes memory pi, bytes memory q) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(y,pi,q));
    }

    // Open_id is the index of this opened request in Request::opened, which should freeze after asking_time
    // TODO: If the (k+1)th price is larger than p/k, pay p/k
    function Claim(uint256 req_id, uint256 open_id) public {
        Request storage req = active_puzzles[req_id];
        require(req.client != address(0));
        require(block.number > req.asking_time);
        require(block.number <= req.refund_time);

        OpenedResponse memory resp = req.opened[open_id]; 
        ClosedResponse memory closed = req.closed[msg.sender];
        require(closed.data == resp.data);
        require(closed.data != bytes32(0));
        // By now, we have checked that the asking price is correct, and that there are no complaints

        // Now, pay the solver
        // Did the solver win?
        uint256 min_to_pay = req.solution_collateral;
        if (open_id < req.k) {
            // If the solver won
            uint256 more_to_pay;
            if (req.opened.length < req.k ) {
                more_to_pay = req.opened[req.opened.length-1].price;
            } else {
                more_to_pay = req.opened[req.k-1].price;
            }
            if (more_to_pay > (req.p/req.k)) {
                more_to_pay = req.p/req.k;
            }
            min_to_pay += more_to_pay;
        }
        bank[msg.sender] -= min_to_pay;
        req.money_left -= min_to_pay;
        payable(msg.sender).transfer(min_to_pay);
        // To prevent replays of claim from the same winner
        delete req.opened[open_id];
        delete req.closed[msg.sender];
    }

    function Refund(uint256 req_id) public {
        Request storage req = active_puzzles[req_id];
        require(req.client == msg.sender, "Invalid sender");
        require(block.number > req.refund_time, "Not a time to refund yet");

        payable(msg.sender).transfer(req.money_left);
        delete active_puzzles[req_id];
    }

    // Complain that ell is not correct
    function Complaint_ell(uint256 req_id, bytes32 hash2, bytes32 hash3, bytes memory y1,bytes memory y2, address addr_bad) public {
        Request storage req = active_puzzles[req_id];
        require(req.client != address(0));
        require(block.number <= req.complaint_time);
        
        ClosedResponse storage resp = req.closed[addr_bad];
        bytes32 hash1 = keccak256(abi.encodePacked(y1,y2));
        bytes32 hash = keccak256(abi.encodePacked(hash1, hash2, hash3, addr_bad));
        require(hash == resp.data, "Invalid hashes given");
        bytes memory b_addr = toBytes(addr_bad);
        bytes memory x2 = toBytes(hash_x2(req.g, b_addr));
        uint256 p = hashToPrime_os(req.g, x2, y1, y2, resp.nonce, b_addr);
        require(p != resp.ell && p+1 != resp.ell, "The solver was correct"); 
        //(ell, nonce, ), "hash to prime check failed");
        delete req.closed[addr_bad];
        bank[addr_bad] -= req.solution_collateral;
        payable(msg.sender).transfer(req.solution_collateral);
        // If we reach this step, the complaint was correct
    }

    function Complaint_ell_not_prime(uint256 req_id, address addr_bad) public {
        Request storage req = active_puzzles[req_id];
        require(req.client != address(0));
        require(block.number <= req.complaint_time);
        
        ClosedResponse storage resp = req.closed[addr_bad];

        if(!millerRabinPrimalityTest(resp.ell)) {
            //(ell, nonce, ), "hash to prime check failed");
            delete req.closed[addr_bad];
            bank[addr_bad] -= req.solution_collateral;
            payable(msg.sender).transfer(req.solution_collateral);
        }        
    }

    function Complaint_invalid_left_proof(uint256 req_id, bytes32 hash1, bytes32 hash3, bytes memory y1, bytes memory pi1, bytes memory q1, address addr_bad) public {
        Request storage req = active_puzzles[req_id];
        require(req.client != address(0));
        require(block.number <= req.complaint_time);
        
        ClosedResponse storage resp = req.closed[addr_bad];
        bytes32 hash2 = keccak256(abi.encodePacked(y1,pi1,q1));
        bytes32 hash = keccak256(abi.encodePacked(hash1, hash2, hash3,addr_bad));
        require(hash == resp.data);
        uint256 r = modexp(2, req.T, resp.ell);
        bytes memory u1 = modexp(pi1, resp.ell);
        bytes memory u2 = modexp(req.g, r);

        require(mulModEqual(u1, u2, y1, q1), "The solver was correct");
        
        delete req.closed[addr_bad];
        bank[addr_bad] -= req.solution_collateral;
        payable(msg.sender).transfer(req.solution_collateral);
    }

    function complain_invalid_right_proof(uint256 req_id, bytes32 hash1, bytes32 hash2, bytes memory y2, bytes memory pi2, bytes memory q2, address addr_bad) public {
        Request storage req = active_puzzles[req_id];
        require(req.client != address(0));
        require(block.number <= req.complaint_time);
        
        ClosedResponse storage resp = req.closed[addr_bad];
        bytes32 hash3 = keccak256(abi.encodePacked(y2,pi2,q2));
        bytes32 hash = keccak256(abi.encodePacked(hash1, hash2, hash3,addr_bad));
        require(hash == resp.data);
        uint256 r = modexp(2, req.T, resp.ell);
        bytes memory u1 = modexp(pi2, resp.ell);
        bytes memory b_addr = toBytes(addr_bad);
        bytes memory x2 = toBytes(hash_x2(req.g, b_addr));
        bytes memory u2 = modexp(x2, r);
        if(!mulModEqual(u1, u2, y2, q2)) {
            delete req.closed[addr_bad];
            bank[addr_bad] -= req.solution_collateral;
            payable(msg.sender).transfer(req.solution_collateral);
        }
    }

   
    function toBytes(address a) public pure returns (bytes memory b){
    assembly {
        let m := mload(0x40)
        a := and(a, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
        mstore(add(m, 20), xor(0x140000000000000000000000000000000000000000, a))
        mstore(0x40, add(m, 52))
        b := m
       }
    }

    function toBytes(uint256 x) public pure returns (bytes memory b) {
        b = new bytes(32);
        assembly { mstore(add(b, 32), x) }
    }

}