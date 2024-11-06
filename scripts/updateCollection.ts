import { Address, fromNano, toNano, beginCell } from '@ton/core';
import { NftCollection } from '../wrappers/TonClubNFT';

import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider, args: string[]) {
  const OFFCHAIN_CONTENT_PREFIX = 0x01;
    const string_first = 'https://s.getgems.io/nft/c/66dcc19f4f7cc9d9e04f0212/';
    let newContent = beginCell().storeInt(OFFCHAIN_CONTENT_PREFIX, 8).storeStringRefTail(string_first).endCell();
    const nftCollection = provider.open(
        await NftCollection.fromAddress(
            Address.parse(process.env.NFT_COLLECTION_ADDRESS!),
        ), // NOTE: Change to the address of the main contract you want to check
    );
    let owner = provider.sender().address!;
    const collectionOwner = await nftCollection.getOwner();
    const collectionOwnerAddress = collectionOwner.toString();
    console.log('Current Contract Owner:', collectionOwnerAddress);
    await nftCollection.send(
      provider.sender(),
      {
          value: toNano('0.01'),
      },
      {
          $$type:"UpdateCollectionContent",
          query_id: BigInt(0),
          new_content: newContent,
          numerator:  100n,
          denominator: 1000n,
          destination: owner
      }
    )
}
