import { Address, toNano, beginCell } from '@ton/core';
import { NftCollection } from '../wrappers/TonClubNFT';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const OFFCHAIN_CONTENT_PREFIX = 0x01;

    const nftFirst = 'https://ipfs.filebase.io/ipfs/Qmcys3NyGWBW7NMgVwsV1zky6yvEQ595SgtNdLS5EU2Dxw/'; 
    const collectionFirst = 'https://ipfs.filebase.io/ipfs/Qmcys3NyGWBW7NMgVwsV1zky6yvEQ595SgtNdLS5EU2Dxw/'; 
    let collectionContent = beginCell().storeInt(OFFCHAIN_CONTENT_PREFIX, 8).storeStringRefTail(collectionFirst).endCell();
    let nftContent = beginCell().storeInt(OFFCHAIN_CONTENT_PREFIX, 8).storeStringRefTail(nftFirst).endCell();

    let owner = provider.sender().address!;
    const nftCollection = provider.open(
        await NftCollection.fromInit(owner, collectionContent, nftContent, {
            $$type: 'RoyaltyParams',
            numerator: 100n, // 350n = 35%
            denominator: 1000n,
            destination: owner,
        }),
    );
    if( (await provider.isContractDeployed(nftCollection.address))){
        return console.log("contract is already deployed. ContractAddress ===>", nftCollection.address)
    }
    await nftCollection.send(
        provider.sender(),
        {
            value: toNano('0.01'),
        },
        {
            $$type: 'Deploy',
            queryId: 0n,
        },
    );
    await nftCollection.send(
        provider.sender(),
        {
            value: toNano('0.05')
        },
        "InitFee"
    )
    await provider.waitForDeploy(nftCollection.address);
}