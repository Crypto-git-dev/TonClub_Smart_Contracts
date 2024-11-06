import { Address, fromNano, toNano } from '@ton/core';
import { NftCollection } from '../wrappers/TonClubNFT';

import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider, args: string[]) {
    const nftCollection = provider.open(
        await NftCollection.fromAddress(Address.parse(process.env.NFT_COLLECTION_ADDRESS!)), // NOTE: Change to the address of the main contract you want to check
    );

    const collectionOwner = await nftCollection.getOwner();
    const collectionOwnerAddress = collectionOwner.toString();
    console.log('Contract Owner before:', collectionOwnerAddress);
    if (collectionOwnerAddress == provider.sender().address?.toString()) {
        await nftCollection.send(
            provider.sender(),
            {
                value: toNano('0.5'),
            },
            'Mint',
        );
    } else {
        console.log('you are not allowed');
    }
}
