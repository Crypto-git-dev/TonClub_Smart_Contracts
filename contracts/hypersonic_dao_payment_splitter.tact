import "@stdlib/deploy";
import "@stdlib/ownable";
message AdminWithdrawal {
    amount: Int as coins;
}
message AdminTopUp {
}
contract HypersonicDAOPaymentSplitter with Deployable, OwnableTransferable {
    owner: Address;
    wallet1: Address;
    wallet2: Address;
    wallet3: Address;
    expensesWallet: Address;
    init(wallet1: Address, wallet2: Address, wallet3: Address, expensesWallet: Address){
        self.owner = sender();
        self.wallet1 = wallet1;
        self.wallet2 = wallet2;
        self.wallet3 = wallet3;
        self.expensesWallet = expensesWallet;
    }

    receive(){
        dump("TON Received, splitting funds to wallets");
        let remainingValue: Int = (context().value - ton("0.05"));
        let walletShare: Int = remainingValue * 30 / 100;
        let expensesShare: Int = remainingValue * 10 / 100;
        send(SendParameters{
                to: self.wallet1,
                value: walletShare,
                bounce: false,
                mode: (SendIgnoreErrors + SendPayGasSeparately)
            }
        );
        send(SendParameters{
                to: self.wallet2,
                value: walletShare,
                bounce: false,
                mode: (SendIgnoreErrors + SendPayGasSeparately)
            }
        );
        send(SendParameters{
                to: self.wallet3,
                value: walletShare,
                bounce: false,
                mode: (SendIgnoreErrors + SendPayGasSeparately)
            }
        );
        send(SendParameters{
                to: self.expensesWallet,
                value: expensesShare,
                bounce: false,
                mode: (SendIgnoreErrors + SendPayGasSeparately)
            }
        );
    }

    receive(topUpData: AdminTopUp){
        dump("Top up received");
    }

    receive(adminWithdrawalData: AdminWithdrawal) {
        require(sender() == self.owner, "Only the owner can do the admin withdrawal.");
        require(adminWithdrawalData.amount <= (myBalance() - ton("1")),
            "Insufficient funds in the contract to withdraw amoount. At least 1 TON must remain in the contract."
        );
        send(SendParameters{
                to: self.owner(),
                value: adminWithdrawalData.amount,
                mode: (SendIgnoreErrors + SendRemainingValue)
            }
        );
    }
    get fun balance(): Int {
        return myBalance();
    }

    get fun wallet1Address(): Address {
        return self.wallet1;
    }

    get fun wallet2Address(): Address {
        return self.wallet2;
    }

    get fun wallet3Address(): Address {
        return self.wallet3;
    }

    get fun expensesWalletAddress(): Address {
        return self.expensesWallet;
    }
}
