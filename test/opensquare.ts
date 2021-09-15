import { ethers } from 'hardhat';

import { E, exp, find_q, mulE, newE, randE, RSA_MODULUS } from './rsa';

const MILLER_RABIN_ROUNDS = 15;
const DST = '0x';

export interface Challenge {
  l: E;
  nonce: number;
}

export interface Proof {
  challenge: Challenge;
  pi1: E;
  pi2: E;
  y1: E;
  y2: E;
  q1: E;
  q2: E;
}

export function compute_asking_hash(a: number, r:number) :string {
  return ethers.utils.solidityKeccak256(['uint256','uint256'],[a,r]);
}

export function compute_h1(y1: E, y2:E) :string {
  return ethers.utils.solidityKeccak256(['bytes','bytes'],[y1,y2]);
}

export function compute_h2(y1: E, pi1:E, q1:E) :string {
  return ethers.utils.solidityKeccak256(['bytes','bytes','bytes'],[y1,pi1,q1]);
}

export function compute_h3(y2: E, pi2:E, q2:E) :string {
  return ethers.utils.solidityKeccak256(['bytes','bytes', 'bytes'],[y2,pi2,q2]);
}

export function hash_x2(g: E, dst:String) :E {
    return newE(ethers.utils.solidityKeccak256(['bytes','bytes'],[g,dst]));
}

export function hash(x: E, y1: E, x2:E, y2:E, nonce: number, pk: string) :E {
    return newE(ethers.utils.solidityKeccak256(['bytes','bytes','bytes','bytes','uint256','bytes'],[x,y1,x2,y2,nonce,pk]));
}

export function hashToPrime(x: E, y1: E, x2:E, y2: E, pk: string): Challenge | null {
    for (let i = 0; i < 1 << 16; i++) {
      let candidate = hash(x, y1, x2, y2, i, pk);
      if (candidate.and(1).eq(0)) {
        candidate = candidate.add(1);
      }
      if (isProbablePrime(candidate)) {
        return { l: candidate, nonce: i };
      }
    }
    return null;
  }

export function randPrime() {
  let i = 0;
  let candidate = randE(32);
  if (candidate.and(1).eq(0)) {
    candidate = candidate.add(1);
  }
  while (true) {
    if (isProbablePrime(candidate)) {
      return candidate;
    }
    candidate = candidate.add(2);
  }
}

export function isProbablePrime(n: E): boolean {
  if (n.lt(3)) {
    return false;
  }
  if (!n.and(1).eq(1)) {
    return false;
  }
  let d = n.sub(1);
  let r = 0;
  while (d.and(1).eq(0)) {
    d = d.shr(1);
    r += 1;
  }

  for (let i = 0; i < MILLER_RABIN_ROUNDS; i++) {
    let a = newE(10); //randBelow(n.sub(3)).add(2);
    let x = exp(a, d, n);
    if (x.eq(1) || x.eq(n.sub(1))) {
      continue;
    }
    let passed = false;
    for (let j = 1; j < r; j++) {
      x = x.mul(x).mod(n);
      if (x.eq(n.sub(1))) {
        passed = true;
        break;
      }
    }
    if (!passed) {
      return false;
    }
  }

  return true;
}

export function evaluate(N:E, T:number, x:E, pk: string): Proof {
  const e = newE(1).shl(T); // 2^T
  const y1 = exp(x, e, N); // x^2^T
  const x2 = hash_x2(x,pk); // x2 = H(x,pk)
  const y2 = exp(x2, e, N); // x2^{2^T}

  // (l, nonce) = H_prime(x,y1,x2,y2,pk)
  
  const challenge = hashToPrime(x, y1, x2, y2, pk)!;

  let z = newE(T);
  let r = newE(1);
  let pi1 = newE(1);
  let pi2 = newE(1);

  while (!z.eq(0)) {
    const r2 = r.mul(2);
    const b = r2.div(challenge.l);
    r = r2.mod(challenge.l);
    const gb1 = exp(x, b, N);
    const gb2 = exp(x2, b, N);
    pi1 = mulE(pi1, pi1, N);
    pi1 = mulE(pi1, gb1, N);
    pi2 = mulE(pi2, pi2, N);
    pi2 = mulE(pi2, gb2, N);
    z = z.sub(1);
  }

  // some extra work for helper value
  const u1 = exp(pi1, challenge.l);
  const u2 = exp(x, e, N);
  const q1 = find_q(u1, u2, N);
  const u12 = exp(pi2, challenge.l);
  const u22 = exp(x2, e, N);
  const q2 = find_q(u12, u22, N);
  return { pi1, pi2, challenge, y1, y2, q1, q2 };
}

export function verify(x: E, T: number, proof: Proof, pk:string): boolean {
  const x2 = hash_x2(x, pk);
  let l = hash(x, proof.y1,x2,proof.y2, proof.challenge.nonce, pk)!;
  if (l.and(1).eq(0)) {
    l = l.add(1);
  }
  if (!l.eq(proof.challenge.l)) {
    return false;
  }
  if (!isProbablePrime(l)) {
    return false;
  }

  const two_T = newE(1).shl(T);
  const u1 = exp(proof.pi1, proof.challenge.l);
  const u2 = exp(x, two_T);
  if (!mulE(u1, u2).eq(proof.y1)) {
      return false;
  }

  const u12 = exp(proof.pi2, proof.challenge.l);
  const u22 = exp(x2, two_T);
  return mulE(u12, u22).eq(proof.y2);
}

const x = randE();
let T:number = 4;
// console.log(x.toString());
const proof = evaluate(RSA_MODULUS, T,x,DST);
console.log('must verify', verify(x, T, proof, DST));
// console.log(proof);
