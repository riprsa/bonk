import * as kit from "@solana/kit";
import { getBuyExactInInstruction } from "./idl/launchpad/instructions/buyExactIn";
import * as system from "@solana-program/system";
import * as token from "@solana-program/token";
import * as cu from "@solana-program/compute-budget";

import fs from "fs";

const LAUNCHPAD = kit.address("LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj");
const WSOL_ADDRESS = kit.address("So11111111111111111111111111111111111111112");
const MINT_ADDRESS = kit.address("mint :)");

const privateKey = fs.readFileSync("your_private_key.json", "utf8");

const yourKeyPair = await kit.createKeyPairSignerFromBytes(
  new Uint8Array(JSON.parse(privateKey))
);

const rpc = kit.createSolanaRpc("your rpc");
const rpcSubscriptions = kit.createSolanaRpcSubscriptions("your rpc websocket");

const addressEncoder = kit.getAddressEncoder();

const [poolStatePDA] = await kit.getProgramDerivedAddress({
  programAddress: LAUNCHPAD,
  seeds: [
    new Uint8Array([112, 111, 111, 108]),
    addressEncoder.encode(MINT_ADDRESS),
    addressEncoder.encode(WSOL_ADDRESS),
  ],
});

const [baseVaultPDA] = await kit.getProgramDerivedAddress({
  programAddress: LAUNCHPAD,
  seeds: [
    new Uint8Array([112, 111, 111, 108, 95, 118, 97, 117, 108, 116]),
    addressEncoder.encode(poolStatePDA),
    addressEncoder.encode(MINT_ADDRESS),
  ],
});

const [quoteVaultPDA] = await kit.getProgramDerivedAddress({
  programAddress: LAUNCHPAD,
  seeds: [
    new Uint8Array([112, 111, 111, 108, 95, 118, 97, 117, 108, 116]),
    addressEncoder.encode(poolStatePDA),
    addressEncoder.encode(WSOL_ADDRESS),
  ],
});

const LAUNCHPAD_CONFIG_ADDRESS = kit.address(
  "6s1xP3hpbAfFoNtUNF8mfHsjr2Bd97JxFJRWLbL6aHuX"
);
const BONK_CONFIG_ADDRESS = kit.address(
  "FfYek5vEz23cMkWsdJwG2oa6EphsvXSHrGpdALN4g6W1"
);
const LAUNCHPAD_AUTHORITY_ADDRESS = kit.address(
  "WLHv2UAZm6z4KyaaELi5pjdbJh6RESMva1Rnn8pJVVh"
);

const BONK_EVENT_AUTHORITY_ADDRESS = kit.address(
  "2DPAtwB8L12vrMRExbLuyGnC7n2J5LNoZQSejeQGpwkr"
);

const [ataUserToken] = await token.findAssociatedTokenPda({
  owner: yourKeyPair.address,
  tokenProgram: token.TOKEN_PROGRAM_ADDRESS,
  mint: MINT_ADDRESS,
});

const createAtaUserTokenIx =
  token.getCreateAssociatedTokenIdempotentInstruction({
    payer: yourKeyPair,
    ata: ataUserToken,
    owner: yourKeyPair.address,
    mint: MINT_ADDRESS,
    systemProgram: system.SYSTEM_PROGRAM_ADDRESS,
    tokenProgram: token.TOKEN_PROGRAM_ADDRESS,
  });

const [ataQuoteToken] = await token.findAssociatedTokenPda({
  owner: yourKeyPair.address,
  tokenProgram: token.TOKEN_PROGRAM_ADDRESS,
  mint: WSOL_ADDRESS,
});

const createAtaQuoteTokenIx = token.getCreateAssociatedTokenInstruction({
  payer: yourKeyPair,
  ata: ataQuoteToken,
  owner: yourKeyPair.address,
  mint: WSOL_ADDRESS,
  systemProgram: system.SYSTEM_PROGRAM_ADDRESS,
  tokenProgram: token.TOKEN_PROGRAM_ADDRESS,
});

const wrapSolIx = system.getTransferSolInstruction({
  source: yourKeyPair,
  destination: ataQuoteToken,
  amount: 1000000n, // should be bigger than amount of sol you want to spend on token
});

const syncNativeIx = token.getSyncNativeInstruction({
  account: ataQuoteToken,
});

const buy = getBuyExactInInstruction({
  payer: yourKeyPair,
  authority: LAUNCHPAD_AUTHORITY_ADDRESS,
  globalConfig: LAUNCHPAD_CONFIG_ADDRESS,
  platformConfig: BONK_CONFIG_ADDRESS,
  poolState: poolStatePDA,
  userBaseToken: ataUserToken,
  userQuoteToken: ataQuoteToken,
  baseVault: baseVaultPDA,
  quoteVault: quoteVaultPDA,
  baseTokenMint: MINT_ADDRESS,
  quoteTokenMint: WSOL_ADDRESS,
  baseTokenProgram: token.TOKEN_PROGRAM_ADDRESS,
  quoteTokenProgram: token.TOKEN_PROGRAM_ADDRESS,
  eventAuthority: BONK_EVENT_AUTHORITY_ADDRESS,
  program: LAUNCHPAD,

  amountIn: 500000, // 0.0005 SOL in lamports
  minimumAmountOut: 1000n, // buy at least 1K tokens. if thats too expensive - it will abort whole tx
  shareFeeRate: 0n,
});

const unwrapSolIx = token.getCloseAccountInstruction({
  account: ataQuoteToken,
  destination: yourKeyPair.address,
  owner: yourKeyPair.address,
});

const computeUnitLimitIx = cu.getSetComputeUnitLimitInstruction({
  units: 1_000_000,
});

const computeUnitPriceIx = cu.getSetComputeUnitPriceInstruction({
  microLamports: 1,
});

const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

let transactionMessage = kit.pipe(
  kit.createTransactionMessage({ version: 0 }),
  (tx) => kit.setTransactionMessageFeePayerSigner(yourKeyPair, tx),
  (tx) => kit.setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
  (tx) =>
    kit.appendTransactionMessageInstructions(
      [
        computeUnitLimitIx,
        computeUnitPriceIx,
        createAtaUserTokenIx,
        createAtaQuoteTokenIx,
        wrapSolIx,
        syncNativeIx,
        buy,
        unwrapSolIx,
      ],
      tx
    )
);

const fstx = await kit.signTransaction(
  [yourKeyPair.keyPair],
  kit.compileTransaction(transactionMessage)
);

const sendAndConfirm = kit.sendAndConfirmTransactionFactory({
  rpc,
  rpcSubscriptions,
});

await sendAndConfirm(fstx, { commitment: "confirmed" });

const transactionSignature = kit.getSignatureFromTransaction(fstx);
console.log(`https://orb.helius.dev/tx/${transactionSignature}`);

const transactionDetails = await rpc
  .getTransaction(transactionSignature, {
    commitment: "confirmed",
    encoding: "json",
    maxSupportedTransactionVersion: 0,
  })
  .send();
console.log(transactionDetails);
