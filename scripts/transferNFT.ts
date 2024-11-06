import { Address, fromNano, toNano } from '@ton/core';
import { NftCollection } from '../wrappers/TonClubNFT';

import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider, args: string[]) {
    const nftCollection = provider.open(
        await NftCollection.fromAddress(
            Address.parse(process.env.NFT_COLLECTION_ADDRESS!),
        ),
    );

    const collectionOwner = await nftCollection.getOwner();
    const collectionOwnerAddress = collectionOwner.toString();
    console.log('Current Contract Owner :', collectionOwnerAddress);
    if (collectionOwnerAddress == provider.sender().address?.toString()) {
        const ui = provider.ui();
        const newOwnerAdress = Address.parse(
            args.length > 0 ? args[0] : await ui.input('Input New Owner Wallet address'),
        );
        await nftCollection.send(
            provider.sender(),
            {
                value: toNano("0.5") ,
            },
            {
                $$type: 'InitialTransfer',
                newOwner: newOwnerAdress,
                amount: BigInt(10)
            },
        );
    } else {
        console.log('you are not allowed');
    }
}
