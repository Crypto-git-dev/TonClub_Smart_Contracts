import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { fromNano, toNano } from '@ton/core';
import { HypersonicDAOPaymentSplitter } from '../wrappers/HypersonicDAOPaymentSplitter';
import '@ton/test-utils';

describe('HypersonicDAOPaymentSplitter', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let hypersonicDAOPaymentSplitter: SandboxContract<HypersonicDAOPaymentSplitter>;

    let wallet1: SandboxContract<TreasuryContract>;
    let wallet2: SandboxContract<TreasuryContract>;
    let wallet3: SandboxContract<TreasuryContract>;
    let expensesWallet: SandboxContract<TreasuryContract>;
    let newOwnerWallet: SandboxContract<TreasuryContract>;


    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        wallet1 = await blockchain.treasury('wallet1');
        wallet2 = await blockchain.treasury('wallet2');
        wallet3 = await blockchain.treasury('wallet3');
        expensesWallet = await blockchain.treasury('expensesWallet');
        newOwnerWallet = await blockchain.treasury('newOwnerWallet');
        hypersonicDAOPaymentSplitter = blockchain.openContract(
            await HypersonicDAOPaymentSplitter.fromInit(
                wallet1.getSender().address,
                wallet2.getSender().address,
                wallet3.getSender().address,
                expensesWallet.getSender().address,
            ),
        );

        const deployResult = await hypersonicDAOPaymentSplitter.send(
            deployer.getSender(),
            {
                value: toNano('0.05'),
            },
            {
                $$type: 'Deploy',
                queryId: 0n,
            },
        );

        const topUpResult = await hypersonicDAOPaymentSplitter.send(
            deployer.getSender(),
            {
                value: toNano('2'),
            },
            {
                $$type: 'AdminTopUp'
            },
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: hypersonicDAOPaymentSplitter.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and hypersonicDAOPaymentSplitter are ready to use
    });

    it('should split funds sent to it to the target wallets', async () => {
        const payment = toNano('1');

        const walletBalancesBefore = [
            fromNano(await wallet1.getBalance()),
            fromNano(await wallet2.getBalance()),
            fromNano(await wallet3.getBalance()),
            fromNano(await expensesWallet.getBalance()),
        ];

        const expectedWallet1BalanceAdded = '0.3';
        const expectedWallet2BalanceAdded = '0.3';
        const expectedWallet3BalanceAdded = '0.3';
        const expectedExpensesWalletBalanceAdded = '0.1';

        const result = await hypersonicDAOPaymentSplitter.send(
            deployer.getSender(),
            {
                value: payment,
            },
            null,
        );

        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: hypersonicDAOPaymentSplitter.address,
            success: true,
        });

        expect(Number(fromNano(await wallet1.getBalance()))).toBeCloseTo(
            Number(walletBalancesBefore[0]) + Number(expectedWallet1BalanceAdded),
            1,
        );
        expect(Number(fromNano(await wallet2.getBalance()))).toBeCloseTo(
            Number(walletBalancesBefore[1]) + Number(expectedWallet2BalanceAdded),
            1,
        );
        expect(Number(fromNano(await wallet3.getBalance()))).toBeCloseTo(
            Number(walletBalancesBefore[2]) + Number(expectedWallet3BalanceAdded),
            1,
        );

        expect(Number(fromNano(await expensesWallet.getBalance()))).toBeCloseTo(
            Number(walletBalancesBefore[3]) + Number(expectedExpensesWalletBalanceAdded),
            1,
        );
    });

    it('should allow the owner to withdraw funds', async () => {
        const withdrawalAmount = toNano('0.7');
        const ownerBalanceBefore = fromNano(await deployer.getBalance());
        const contractBalanceBefore = fromNano(await hypersonicDAOPaymentSplitter.getBalance());

        const result = await hypersonicDAOPaymentSplitter.send(
            deployer.getSender(),
            {
                value: toNano('0.05'),
            },
            {
                $$type: 'AdminWithdrawal',
                amount: withdrawalAmount,
            },
        );

        expect(result.transactions).toHaveTransaction({
            success: true,
        });

        const ownerBalanceAfter = fromNano(await deployer.getBalance());
        const contractBalanceAfter = fromNano(await hypersonicDAOPaymentSplitter.getBalance());

        expect(Number(ownerBalanceAfter)).toBeCloseTo(
            Number(ownerBalanceBefore) + Number(fromNano(withdrawalAmount)),
            1,
        );
        expect(Number(contractBalanceAfter)).toBeCloseTo(
            Number(contractBalanceBefore) - Number(fromNano(withdrawalAmount)),
            1,
        );
    });
    it('should transfer Ownership', async () => {
        const OwnerContract = await hypersonicDAOPaymentSplitter.getOwner();
        expect(OwnerContract.toString()).toEqual(deployer.address.toString());
        const result = await hypersonicDAOPaymentSplitter.send(
            deployer.getSender(),
            {
                value: toNano(0.05),
            },
            {
                $$type: 'ChangeOwner',
                queryId: BigInt(true),
                newOwner: newOwnerWallet.address,
            }
        )
        const newOwnerContract = await hypersonicDAOPaymentSplitter.getOwner();
        expect(result.transactions).toHaveTransaction({
            success: true,
        });
        expect(newOwnerContract.toString()).toEqual(newOwnerWallet.address.toString());
    })
});
