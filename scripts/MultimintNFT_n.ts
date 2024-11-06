import { Address, fromNano, toNano } from '@ton/core';
import { TonClient, Cell, WalletContractV4 } from '@ton/ton';
import { mnemonicToWalletKey } from 'ton-crypto';

import { NftCollection } from '../wrappers/TonClubNFT';
import { getHttpEndpoint } from '@orbs-network/ton-access';

import { NetworkProvider } from '@ton/blueprint';

export async function run() {
    const endpoint = await getHttpEndpoint({ network: 'mainnet' });
    const client = new TonClient({ endpoint });

    const mnemonic = process.env.mnemonic!; // your 24 secret words (replace ... with the rest of the words)
    const key = await mnemonicToWalletKey(mnemonic.split(' '));
    console.log(mnemonic);
    const wallet = WalletContractV4.create({ publicKey: key.publicKey, workchain: 0 });
    if (!(await client.isContractDeployed(wallet.address))) {
        return console.log('wallet is not deployed');
    }

    // open wallet and read the current seqno of the wallet
    const walletContract = client.open(wallet);
    const walletSender = walletContract.sender(key.secretKey);
    

    const contractAddress = Address.parse(process.env.NFT_COLLECTION_ADDRESS!);
    const collection = await NftCollection.fromAddress(contractAddress);
    const nftCollection = client.open(collection);
    const collectionOwner = await nftCollection.getOwner();
    const collectionOwnerAddress = collectionOwner.toString();
    console.log('Contract Owner before:', collectionOwnerAddress);
    let i=0;
    while(i < 1){
        await nftCollection.send(
            walletSender,
            {
                value: toNano('0.5'),
            },
            {
                $$type: "MultiMint",
                amount: BigInt(10)
            }
        );
        let seqno = await walletContract.getSeqno();
        console.log(i, "=======", seqno);
        let currentSeqno = seqno;
        while (currentSeqno == seqno) {
            console.log('waiting for transaction to confirm...');
            await sleep(2000);
            currentSeqno = await walletContract.getSeqno();
        }
        console.log('transaction confirmed!');
        i++;
    }
}
function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
