import { ethers } from 'hardhat';
import { randE, RSA_MODULUS, RSA_MODULUS_BYTES, to256Bytes, toBytes } from './rsa';
import { OpenSquaring } from '../typechain/OpenSquaring';

import { expect, use } from 'chai';
import { solidity } from 'ethereum-waffle';
import { evaluate, compute_asking_hash, compute_h1, compute_h2 } from './opensquare';

use(solidity);


describe('OpenSquaring', function () {
  let C: OpenSquaring;

  beforeEach(async function () {
    const factory = await ethers.getContractFactory('OpenSquaring');
    C = (await factory.deploy()) as OpenSquaring;
  });

  it('new request p1 gas', async function () {
    const res1 = await C.estimateGas.NewRequest_p1(1,2,3,4,4,10,10,{value:10});
    console.log("New Request 1 Gas Cost", res1.toNumber());
  });

  it('new request p2 gas', async function () {
    const [owner, addr1] = await ethers.getSigners();
    const g = toBytes(randE(256),256);
    await C.connect(owner).NewRequest_p1(1,2,3,4,4,10,10,{value:10});
    const res1 = await C.connect(owner).estimateGas.NewRequest_p2(g,4,0);
    console.log("New Request 2 Gas Cost", res1.toNumber());
  });

  it('Solution Submission cost', async function () {
    const [owner, addr1] = await ethers.getSigners();
    const x = randE(256);
    const g = toBytes(x,256);
    let T:number = 4;
    // Create a request first
    await C.connect(owner).NewRequest_p1(3,4,5,6,4,10,10,{value:10});
    await C.connect(owner).NewRequest_p2(g,4,0);
    let asking_hash = compute_asking_hash(100,200);
    let solver_addr = await addr1.getAddress();
    let proof = evaluate(RSA_MODULUS, T, x,solver_addr);
    let res1 = await C.connect(addr1).estimateGas.SubmitSolution(0,asking_hash,proof.challenge.l, proof.challenge.nonce, to256Bytes(proof.pi1), to256Bytes(proof.pi2), to256Bytes(proof.y1), to256Bytes(proof.y2), to256Bytes(proof.q1), to256Bytes(proof.q2),{value:10});
    // Now try submitting a solution

    console.log("Solution Submission Gas Cost", res1.toNumber());
  });

  it('Asking cost', async function () {
    const [owner, addr1] = await ethers.getSigners();
    const x = randE(256);
    const g = toBytes(x,256);
    let T:number = 4;
    // Create a request first
    await C.connect(owner).NewRequest_p1(2,3,4,5,4,10,10,{value:10});
    await C.connect(owner).NewRequest_p2(g,4,0);
    let asking_hash = compute_asking_hash(100,200);
    let solver_addr = await addr1.getAddress();
    let proof = evaluate(RSA_MODULUS, T, x,solver_addr);
    await C.connect(addr1).SubmitSolution(0,asking_hash,proof.challenge.l, proof.challenge.nonce, to256Bytes(proof.pi1), to256Bytes(proof.pi2), to256Bytes(proof.y1), to256Bytes(proof.y2), to256Bytes(proof.q1), to256Bytes(proof.q2),{value:10});

     // Simply trying to go ahead one block
     await C.connect(owner).NewRequest_p1(2,3,4,5,4,10,10,{value:10});
     await C.connect(owner).NewRequest_p1(2,3,4,5,4,10,10,{value:10});

    // Now try asking for a solution
    let res1 = await C.connect(addr1).estimateGas.Ask(0,100,200);

    console.log("Asking Gas Cost", res1.toNumber());
  });

  it('Refund cost', async function () {
    const [owner, addr1] = await ethers.getSigners();
    const x = randE(256);
    const g = toBytes(x,256);
    let T:number = 4;
    // Create a request first
    await C.connect(owner).NewRequest_p1(2,3,4,5,4,10,10,{value:10});
    await C.connect(owner).NewRequest_p2(g,4,0);
    let asking_hash = compute_asking_hash(100,200);
    let solver_addr = await addr1.getAddress();
    let proof = evaluate(RSA_MODULUS, T, x,solver_addr);
    await C.connect(addr1).SubmitSolution(0,asking_hash,proof.challenge.l, proof.challenge.nonce, to256Bytes(proof.pi1), to256Bytes(proof.pi2), to256Bytes(proof.y1), to256Bytes(proof.y2), to256Bytes(proof.q1), to256Bytes(proof.q2),{value:10});

    // Use this to go ahead one block
    // Simply trying to go ahead one block
    await C.connect(owner).NewRequest_p1(2,3,4,5,4,10,10,{value:10});
    await C.connect(owner).NewRequest_p1(2,3,4,5,4,10,10,{value:10});

    // Now try asking for a solution
    await C.connect(addr1).Ask(0,100,200);

    // Use this to go ahead one block
    // Simply trying to go ahead one block
    await C.connect(owner).NewRequest_p1(2,3,4,5,4,10,10,{value:10});


    // Now try refunding
    let res1 = await C.connect(owner).estimateGas.Refund(0);

    console.log("Refund Gas Cost", res1.toNumber());
  });

  it('complain ell should not complain for a correct ell', async function () {
    const [owner, addr1] = await ethers.getSigners();
    const x = randE(256);
    const g = toBytes(x,256);
    let T:number = 4;
    // Create a request first
    await C.connect(owner).NewRequest_p1(2,3,4,5,4,10,10,{value:10});
    await C.connect(owner).NewRequest_p2(g,4,0);
    let asking_hash = compute_asking_hash(100,200);
    let solver_addr = await addr1.getAddress();
    let proof = evaluate(RSA_MODULUS, T, x,solver_addr);
    await C.connect(addr1).SubmitSolution(0,asking_hash,proof.challenge.l, proof.challenge.nonce, to256Bytes(proof.pi1), to256Bytes(proof.pi2), to256Bytes(proof.y1), to256Bytes(proof.y2), to256Bytes(proof.q1), to256Bytes(proof.q2),{value:10});

    const h2 = await C.view_intermediate_hash2_3(to256Bytes(proof.y1), to256Bytes(proof.pi1), to256Bytes(proof.q1));
    const h3 = await C.view_intermediate_hash2_3(to256Bytes(proof.y2), to256Bytes(proof.pi2), to256Bytes(proof.q2));
    // console.log(hr2,h2);
    await expect(C.estimateGas.Complaint_ell(0,h2, h3,to256Bytes(proof.y1),to256Bytes(proof.y2), solver_addr)).to.be.revertedWith("The solver was correct");
  });

  it('complain ell cost for incorrect solution', async function () {
    const [owner, addr1] = await ethers.getSigners();
    const x = randE(256);
    const g = toBytes(x,256);
    let T:number = 4;
    // Create a request first
    await C.connect(owner).NewRequest_p1(2,3,4,5,4,10,10,{value:10});
    await C.connect(owner).NewRequest_p2(g,4,0);
    let asking_hash = compute_asking_hash(100,200);
    let solver_addr = await addr1.getAddress();
    let proof = evaluate(RSA_MODULUS, T, x,solver_addr);
    await C.connect(addr1).SubmitSolution(0,asking_hash,proof.challenge.l.add(10), proof.challenge.nonce, to256Bytes(proof.pi1), to256Bytes(proof.pi2), to256Bytes(proof.y1), to256Bytes(proof.y2), to256Bytes(proof.q1), to256Bytes(proof.q2),{value:10});

    const h2 = await C.view_intermediate_hash2_3(to256Bytes(proof.y1), to256Bytes(proof.pi1), to256Bytes(proof.q1));
    const h3 = await C.view_intermediate_hash2_3(to256Bytes(proof.y2), to256Bytes(proof.pi2), to256Bytes(proof.q2));
    // console.log(hr2,h2);
    let res1 = await C.estimateGas.Complaint_ell(0,h2, h3,to256Bytes(proof.y1),to256Bytes(proof.y2), solver_addr);
    console.log("Complain ell cost", res1.toNumber());
  });

  it('complain hash to prime ell cost for incorrect solution', async function () {
    const [owner, addr1] = await ethers.getSigners();
    const x = randE(256);
    const g = toBytes(x,256);
    let T:number = 4;
    // Create a request first
    await C.connect(owner).NewRequest_p1(2,3,4,5,4,10,10,{value:10});
    await C.connect(owner).NewRequest_p2(g,4,0);
    let asking_hash = compute_asking_hash(100,200);
    let solver_addr = await addr1.getAddress();
    let proof = evaluate(RSA_MODULUS, T, x,solver_addr);
    await C.connect(addr1).SubmitSolution(0,asking_hash,proof.challenge.l.add(10), proof.challenge.nonce, to256Bytes(proof.pi1), to256Bytes(proof.pi2), to256Bytes(proof.y1), to256Bytes(proof.y2), to256Bytes(proof.q1), to256Bytes(proof.q2),{value:10});

    const h2 = await C.view_intermediate_hash2_3(to256Bytes(proof.y1), to256Bytes(proof.pi1), to256Bytes(proof.q1));
    const h3 = await C.view_intermediate_hash2_3(to256Bytes(proof.y2), to256Bytes(proof.pi2), to256Bytes(proof.q2));
    // console.log(hr2,h2);
    let res1 = await C.estimateGas.Complaint_ell_not_prime(0, solver_addr);
    console.log("Complain hash to prime ell cost", res1.toNumber());
  });

  it('complain left check for incorrect solution', async function () {
    const [owner, addr1] = await ethers.getSigners();
    const x = randE(256);
    const g = toBytes(x,256);
    let T:number = 4;
    // Create a request first
    await C.connect(owner).NewRequest_p1(2,3,4,5,4,10,10,{value:10});
    await C.connect(owner).NewRequest_p2(g,4,0);
    let asking_hash = compute_asking_hash(100,200);
    let solver_addr = await addr1.getAddress();
    let proof = evaluate(RSA_MODULUS, T, x,solver_addr);
    await C.connect(addr1).SubmitSolution(0,asking_hash,proof.challenge.l.add(100), proof.challenge.nonce, to256Bytes(proof.pi1), to256Bytes(proof.pi2), to256Bytes(proof.y1), to256Bytes(proof.y2), to256Bytes(proof.q1), to256Bytes(proof.q2),{value:10});

    const h1 = await C.view_intermediate_hash1(to256Bytes(proof.y1), to256Bytes(proof.y2));
    const h2 = await C.view_intermediate_hash2_3(to256Bytes(proof.y1), to256Bytes(proof.pi1), to256Bytes(proof.q1));
    const h3 = await C.view_intermediate_hash2_3(to256Bytes(proof.y2), to256Bytes(proof.pi2), to256Bytes(proof.q2));
    // console.log(hr2,h2);
    let res1 = await C.estimateGas.Complaint_invalid_left_proof(0, h1, h3, to256Bytes(proof.y1), to256Bytes(proof.pi1), to256Bytes(proof.q1), solver_addr);
    console.log("Complain hash left check", res1.toNumber());
  });

  it('Gas cost for claim', async function () {
      const [owner, addr1] = await ethers.getSigners();
      const x = randE(256);
      const g = toBytes(x,256);
      let T:number = 4;
      // Create a request first
      await C.connect(owner).NewRequest_p1(2,3,4,5,4,10,10,{value:10});
      await C.connect(owner).NewRequest_p2(g,4,0);
      let asking_hash = compute_asking_hash(100,200);
      let solver_addr = await addr1.getAddress();
      let proof = evaluate(RSA_MODULUS, T, x,solver_addr);
      await C.connect(addr1).SubmitSolution(0,asking_hash,proof.challenge.l, proof.challenge.nonce, to256Bytes(proof.pi1), to256Bytes(proof.pi2), to256Bytes(proof.y1), to256Bytes(proof.y2), to256Bytes(proof.q1), to256Bytes(proof.q2),{value:10});
  
      // Simply trying to go ahead one block
      await C.connect(owner).NewRequest_p1(2,3,4,5,4,10,10,{value:10});
      await C.connect(owner).NewRequest_p1(2,3,4,5,4,10,10,{value:10});
  
      // Now ask for a solution
      await C.connect(addr1).Ask(0,100,200);

      let res1 = await C.connect(addr1).estimateGas.Claim(0,0);
      console.log("Claiming Gas Cost", res1.toNumber());
  });

  it('Gas cost for Asking (as k increases)', async function () {
    const addresses = await ethers.getSigners();
    const owner = addresses.shift()!;
    const x = randE(256);
    const g = toBytes(x,256);
    let T:number = 4;
    const UpperBound = 19;
    let Start = 100;
    // Create a request first
    await C.connect(owner).NewRequest_p1(UpperBound,UpperBound+1,10*UpperBound,11*UpperBound+4,UpperBound,10,10,{value:10});
    await C.connect(owner).NewRequest_p2(g,4,0);
    console.log("Debug", (await C.getTime(0)).map(function(i) {
      i.toNumber()
    }));
    for (let index = 0; index < UpperBound; index++) {
      let asking_hash = compute_asking_hash(Start,200);
      Start -= 1;
      let solver_addr = await addresses[index].getAddress();
      let proof = evaluate(RSA_MODULUS, T, x,solver_addr);
      await C.connect(addresses[index]).SubmitSolution(0,asking_hash,proof.challenge.l, proof.challenge.nonce, to256Bytes(proof.pi1), to256Bytes(proof.pi2), to256Bytes(proof.y1), to256Bytes(proof.y2), to256Bytes(proof.q1), to256Bytes(proof.q2),{value:10});
    }

    // Simply trying to go ahead one block
    await C.connect(owner).NewRequest_p1(2,3,4,5,4,10,10,{value:10});
    // await C.connect(owner).NewRequest_p1(2,3,4,5,4,10,10,{value:10});

    Start = 100;
    let GasCosts: Array<number> = [];
    // Now ask for a solution
    for (let index = 0; index < UpperBound; index++) {
      let g1 = await C.connect(addresses[index]).estimateGas.Ask(0,Start,200);
      GasCosts.push(g1.toNumber());
      C.connect(addresses[index]).Ask(0,Start,200);
      Start -= 1;
    }
    // GasCosts = GasCosts.reverse();

    console.log("Asking Gas Cost Vector", GasCosts);
  });
  
});
