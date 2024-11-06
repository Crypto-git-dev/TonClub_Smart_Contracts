import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { fromNano, toNano, beginCell } from '@ton/core';
import { NftCollection } from '../wrappers/TonClubNFT';
import '@ton/test-utils';

describe('HypersonicNFT', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let newOwnerWallet: SandboxContract<TreasuryContract>;
    let nftCollection: SandboxContract<NftCollection>;

    let wallet1: SandboxContract<TreasuryContract>;
    let wallet2: SandboxContract<TreasuryContract>;
    let wallet3: SandboxContract<TreasuryContract>;

    const OFFCHAIN_CONTENT_PREFIX = 0x01;
    const string_first = 'https://s.getgems.io/nft-staging/c/628f6ab8077060a7a8d52d63/'; // Change to the content URL you prepared
    let newContent = beginCell().storeInt(OFFCHAIN_CONTENT_PREFIX, 8).storeStringRefTail(string_first).endCell();
    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        wallet1 = await blockchain.treasury('wallet1');
        wallet2 = await blockchain.treasury('wallet2');
        wallet3 = await blockchain.treasury('wallet3');
        newOwnerWallet = await blockchain.treasury('newOwnerWallet');
        nftCollection = blockchain.openContract(
            await NftCollection.fromInit(deployer.address, newContent, newContent, {
                $$type: 'RoyaltyParams',
                numerator: 300n, // 350n = 35%
                denominator: 1000n,
                destination: deployer.address,
            }),
        );

        const deployResult = await nftCollection.send(
            deployer.getSender(),
            {
                value: toNano('0.05'),
            },
            {
                $$type: 'Deploy',
                queryId: 0n,
            },
        );
        await nftCollection.send(
            deployer.getSender(),
            {
                value: toNano('0.06'),
            },
            'InitFee',
        );
        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: nftCollection.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
    });
    it('should mint 10000 NFT', async () => {
        let i = 0;
        while (i < 10000) {
            let mintResult = await nftCollection.send(
                deployer.getSender(),
                {
                    value: toNano('0.05'),
                },
                'Mint',
            );
            expect(mintResult.transactions).toHaveTransaction({
                success: true,
            });
            i++;
        }
        const collectionData = await nftCollection.getGetCollectionData();
        console.log('collection_Data =======>', collectionData);
    });
    it('should transfer Ownership', async () => {
        const OwnerContract = await nftCollection.getOwner();
        expect(OwnerContract.toString()).toEqual(deployer.address.toString());
        const result = await nftCollection.send(
            deployer.getSender(),
            {
                value: toNano(0.05),
            },
            {
                $$type: 'ChangeOwner',
                queryId: BigInt(true),
                newOwner: newOwnerWallet.address,
            },
        );
        const newOwnerContract = await nftCollection.getOwner();
        expect(result.transactions).toHaveTransaction({
            success: true,
        });
        expect(newOwnerContract.toString()).toEqual(newOwnerWallet.address.toString());
    });
});
