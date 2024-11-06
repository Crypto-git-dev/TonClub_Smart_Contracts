import "@stdlib/deploy";
import "@stdlib/ownable";
import "@stdlib/stoppable";

struct Payout {
    amount: Int as coins;
    recipient: Address?;
}

struct Upline {
    mapping: map<Int, Address>;
    count: Int;
}

struct Invited {
    mapping: map<Int, Address>;
    count: Int;
}

message Register {
    walletAddress: Address;
    username: String;
    upline: Upline;
    contractKey: String;
}

message RegisteredEvent {
    walletAddress: Address;
    username: String;
    inviter: Address;
    userNumber: Int;
}

message RegistrationSuccessful {
    walletAddress: Address;
    username: String;
    upline: Upline;
}

message AddNewlyInvitedUser {
    inviterAddress: Address;
}

message Deposit {
    walletAddress: Address;
    amount: Int as coins;
    contractKey: String;
}

message DepositedEvent {
    walletAddress: Address;
    amount: Int as coins;
}

message DepositSuccessful {
    walletAddress: Address;
}

message Withdraw {
    walletAddress: Address;
    amount: Int as coins;
    contractKey: String;
}

message WithdrawalSuccessful {
    walletAddress: Address;
    amount: Int as coins;
}

message WithdrawEvent {
    walletAddress: Address;
    amount: Int as coins;
}

message UpgradePlan {
    walletAddress: Address;
    targetPackageLevel: Int;
    targetPackageLevelPrice: Int as coins;
    payouts: map<Int, Payout>;
    contractKey: String;
}

message UpgradePlanSuccessful {
    walletAddress: Address;
    targetLevel: Int;
    payouts: map<Int, Payout>;
}

message UpgradePlanSuccessfulEvent {
    walletAddress: Address;
    targetLevel: Int;
    payouts: map<Int, Payout>;
}

message SubscribeToMatrix {
    walletAddress: Address;
    contractKey: String;
    subscriptionType: String;
    subscriptionPrice: Int as coins;
    parentUser: Address;
    placementUnderParent: String;
}

message SubscribeToMatrixSuccessful {
    walletAddress: Address;
    subscriptionType: String;
    expirationDate: Int;
}

message SubscribeToMatrixSuccessfulEvent {
    walletAddress: Address;
    subscriptionType: String;
    expirationDate: Int;
    numberOfSubscribedUsers: Int;
}

message MonthlyDistributionList {
    monthlyDistributions: map<Int, MonthlyDistribution>;
    numberOfDistributions: Int;
    contractKey: String;
}

message MonthlyDistribution {
    walletAddress: Address;
    memberRevenue: Int as coins;
    companyRevenue: Int as coins;
    subscriptionFee: Int as coins;
    contractKey: String;
}

message MonthlyDistributionSuccessful {
    walletAddress: Address;
    memberRevenue: Int as coins;
    companyRevenue: Int as coins;
    subscriptionFee: Int as coins;
    endingMemberBalance: Int as coins;
    deactivated: Bool;
    matrixSubscriptionGracePeriodActive: Bool;
}

message MonthlyDistributionSuccessfulEvent {
    walletAddress: Address;
    memberRevenue: Int as coins;
    companyRevenue: Int as coins;
    subscriptionFee: Int as coins;
    endingMemberBalance: Int as coins;
    deactivated: Bool;
    matrixSubscriptionGracePeriodActive: Bool;
}

message AdminWithdrawal {
    amount: Int as coins;
    contractKey: String;
}

message AdminWithdrawalEvent {
    amount: Int as coins;
}

message PreRegisterMember {
    walletAddress: Address;
    username: String;
    upline: Upline;
    packageLevel: Int;
    matrixParentUser: Address?;
    matrixPosition: String?;
    subscriptionType: String?;
    contractKey: String;
}

message PreRegisterMemberSuccessful {
    walletAddress: Address;
    username: String;
    upline: Upline;
    packageLevel: Int;
    matrixParentUser: Address;
    matrixPosition: String;
    subscriptionType: String;
}

message PreRegisterMemberSuccessfulEvent {
    walletAddress: Address;
    username: String;
    upline: Upline;
    packageLevel: Int;
    matrixParentUser: Address;
    matrixPosition: String;
    subscriptionType: String;
}

message ForcePlaceInMatrix {
    walletAddress: Address;
    contractKey: String;
    subscriptionType: String?;
    subscriptionPrice: Int as coins;
    parentUser: Address?;
    placementUnderParent: String?;
}

contract HypersonicMainContract with Deployable, Resumable, OwnableTransferable {
    owner: Address;
    stopped: Bool;
    numberOfUsers: Int = 0;
    numberOfSubscribedUsers: Int = 0;
    companyUniLevelUser: Address;
    startDate: Int;
    contractKey: String;

    init(companyUniLevelUser: Address, contractKey: String){
        self.owner = sender();
        self.stopped = false;
        self.companyUniLevelUser = companyUniLevelUser;
        self.contractKey = contractKey;
        self.startDate = now();
    }

    fun requireSufficientTransactionFee() {
        require(context().value >= ton("0.25"), "You must attach an amount of TON greater than the transaction fee to pay for gas fees. Excess TON will be returned.");
    }

    fun requireValidContractKey(contractKey: String) {
        require(contractKey == self.contractKey, "Invalid contract key");
    }

    fun requireFromValidUserContract(userContractAddress: Address) {
        let validUserContractInit: StateInit = initOf HypersonicUserContract(userContractAddress);
        let validUserContractAddress: Address = contractAddress(validUserContractInit);

        require(sender() == validUserContractAddress, "Access denied");
    }

    receive(){
        dump("empty message received");
    }

    receive("Deposited"){
        dump("Successfully deposited");
    }

    receive(registrationData: Register){
        self.requireNotStopped();

        self.requireSufficientTransactionFee();
        self.requireValidContractKey(registrationData.contractKey);
        require(registrationData.walletAddress != registrationData.upline.mapping.get(0), "You can't invite yourself");
        require(registrationData.walletAddress == sender(), "You must register with your own wallet address");

        let init: StateInit = initOf HypersonicUserContract(registrationData.walletAddress);
        let address: Address = contractAddress(init);

        self.numberOfUsers += 1;

        send(SendParameters{
                to: address,
                value: ton("0.3"),
                mode: SendIgnoreErrors,
                code: init.code, // attaching the state init will cause the message to deploy
                data: init.data,
                body: Register{
                    walletAddress: registrationData.walletAddress,
                    username: registrationData.username,
                    upline: registrationData.upline,
                    contractKey: registrationData.contractKey
                }.toCell()
            }
        );
    }

    receive(registrationSuccessfulData: RegistrationSuccessful){
        self.requireFromValidUserContract(registrationSuccessfulData.walletAddress);

        self.numberOfUsers += 1;

        emit(RegisteredEvent{
                walletAddress: registrationSuccessfulData.walletAddress,
                username: registrationSuccessfulData.username,
                inviter: registrationSuccessfulData.upline.mapping.get(1)!!,
                userNumber: self.numberOfUsers
            }.toCell()
        );

        send(SendParameters{
                to: registrationSuccessfulData.walletAddress,
                value: 0, // return fees
                mode: (SendIgnoreErrors + SendRemainingValue)
            }
        );
    }

    receive(depositData: Deposit){
        self.requireNotStopped();

        require(depositData.walletAddress == sender(), "You must deposit with your own wallet address");
        require(context().value >= depositData.amount + ton("0.25"), "You must attach an amount of TON greater than the transaction fee to pay for gas fees. Excess TON will be returned...");
        self.requireValidContractKey(depositData.contractKey);
        
        let init: StateInit = initOf HypersonicUserContract(depositData.walletAddress);
        let address: Address = contractAddress(init);

        send(SendParameters{
                to: address,
                value: 0,
                mode: (SendRemainingValue + SendIgnoreErrors),
                body: Deposit{walletAddress: depositData.walletAddress, amount: depositData.amount, contractKey: depositData.contractKey}.toCell()
            }
        );

        emit(DepositedEvent{walletAddress: depositData.walletAddress, amount: depositData.amount}.toCell());
    }

    receive(depositSuccessfulData: DepositSuccessful){
        self.requireFromValidUserContract(depositSuccessfulData.walletAddress);

        send(SendParameters{
                to: depositSuccessfulData.walletAddress,
                value: ton("0.20"), // return fees
                mode: SendIgnoreErrors
            }
        );

        emit(DepositSuccessful{walletAddress: depositSuccessfulData.walletAddress}.toCell());
    }

    receive(withdrawData: Withdraw){
        self.requireNotStopped();

        self.requireSufficientTransactionFee();
        self.requireValidContractKey(withdrawData.contractKey);
        require(withdrawData.walletAddress == sender(), "You must withdraw with your own wallet address");
        require(withdrawData.amount <= myBalance(), "Insufficient funds in main contract to withdraw amoount");

        let init: StateInit = initOf HypersonicUserContract(withdrawData.walletAddress);
        let address: Address = contractAddress(init);

        send(SendParameters{
                to: address,
                value: 0,
                mode: (SendRemainingValue + SendIgnoreErrors),
                body: Withdraw{walletAddress: withdrawData.walletAddress, amount: withdrawData.amount, contractKey: withdrawData.contractKey}.toCell()
            }
        );
    }

    receive(withdrawalData: WithdrawalSuccessful){
        self.requireFromValidUserContract(withdrawalData.walletAddress);

        emit(WithdrawEvent{walletAddress: withdrawalData.walletAddress, amount: withdrawalData.amount}.toCell());

        send(SendParameters{
                to: withdrawalData.walletAddress,
                value: (withdrawalData.amount + ton("0.20")), // Return fee
                mode: SendIgnoreErrors
            }
        );
    }

    receive(upgradePlanData: UpgradePlan){
        self.requireNotStopped();

        self.requireSufficientTransactionFee();
        self.requireValidContractKey(upgradePlanData.contractKey);
        require(upgradePlanData.walletAddress == sender(), "You must upgrade your plan with your own wallet address");

        let init: StateInit = initOf HypersonicUserContract(upgradePlanData.walletAddress);
        let address: Address = contractAddress(init);

        send(SendParameters{
                to: address,
                value: 0,
                mode: (SendRemainingValue + SendIgnoreErrors),
                body: UpgradePlan{
                    walletAddress: upgradePlanData.walletAddress,
                    targetPackageLevel: upgradePlanData.targetPackageLevel,
                    targetPackageLevelPrice: upgradePlanData.targetPackageLevelPrice,
                    payouts: upgradePlanData.payouts,
                    contractKey: upgradePlanData.contractKey
                }.toCell()
            }
        );
    }

    receive(upgradePlanData: UpgradePlanSuccessful){
        self.requireFromValidUserContract(upgradePlanData.walletAddress);

        let i: Int = 0;
        repeat (8) {       
            i = i + 1;

            if (upgradePlanData.payouts.get(i) != null) {
                 let payout: Payout = upgradePlanData.payouts.get(i)!!;
            
                if (payout.recipient != null && payout.recipient != self.companyUniLevelUser) {
                    let init: StateInit = initOf HypersonicUserContract(payout.recipient!!);
                    let address: Address = contractAddress(init);

                    send(SendParameters{
                            to: address,
                            value: context().value / 7,
                            mode: SendIgnoreErrors,
                            body: PayoutReceived{
                                companyAddress: self.companyUniLevelUser,
                                amount: payout.amount
                            }.toCell()
                        });   
                } else {
                     send(SendParameters{
                        to: self.companyUniLevelUser,
                        value: payout.amount,
                        mode: SendIgnoreErrors
                    });
                }
            }
        }

        send(SendParameters{
            to: upgradePlanData.walletAddress,
            value: ton("0.2"),
            mode: SendIgnoreErrors
        });

        emit(UpgradePlanSuccessfulEvent{
                walletAddress: upgradePlanData.walletAddress,
                targetLevel: upgradePlanData.targetLevel,
                payouts: upgradePlanData.payouts
            }.toCell()
        );
    }

    receive(subscribeToMatrixData: SubscribeToMatrix){
        self.requireNotStopped();

        self.requireSufficientTransactionFee();
        self.requireValidContractKey(subscribeToMatrixData.contractKey);
        
        require(subscribeToMatrixData.walletAddress == sender(), "You must subscribe to matrix with your own wallet address");

        let init: StateInit = initOf HypersonicUserContract(subscribeToMatrixData.walletAddress);
        let address: Address = contractAddress(init);

        send(SendParameters{
                to: address,
                value: ton("0.25"),
                mode: SendIgnoreErrors,
                body: SubscribeToMatrix{
                    walletAddress: subscribeToMatrixData.walletAddress,
                    subscriptionType: subscribeToMatrixData.subscriptionType,
                    subscriptionPrice: subscribeToMatrixData.subscriptionPrice,
                    contractKey: subscribeToMatrixData.contractKey,
                    parentUser: subscribeToMatrixData.parentUser,
                    placementUnderParent: subscribeToMatrixData.placementUnderParent
                }.toCell()
            }
        );
    }

    receive(subscribeToMatrixSuccessfulData: SubscribeToMatrixSuccessful){
        self.requireFromValidUserContract(subscribeToMatrixSuccessfulData.walletAddress);
        
        self.numberOfSubscribedUsers += 1;

        send(SendParameters{
                to: subscribeToMatrixSuccessfulData.walletAddress,
                value: ton("0.20"), // return fees
                mode: SendIgnoreErrors
            }
        );

        emit(SubscribeToMatrixSuccessfulEvent{
                walletAddress: subscribeToMatrixSuccessfulData.walletAddress,
                subscriptionType: subscribeToMatrixSuccessfulData.subscriptionType,
                expirationDate: subscribeToMatrixSuccessfulData.expirationDate,
                numberOfSubscribedUsers: self.numberOfSubscribedUsers
            }.toCell()
        );
    }

    receive(monthlyDistributionListData: MonthlyDistributionList){
        self.requireNotStopped();

        self.requireValidContractKey(monthlyDistributionListData.contractKey);
        require(sender() == self.owner, "Only the owner can run the monthly distributions.");
        require(context().value >= monthlyDistributionListData.numberOfDistributions * ton("0.25"), "You must attach an amount of TON greater than the transaction fee to pay for gas fees. Excess TON will be returned.");

        let i: Int = 0;
        repeat (monthlyDistributionListData.numberOfDistributions) {
            i = i + 1;

            let monthlyDistributionData: MonthlyDistribution = monthlyDistributionListData.monthlyDistributions.get(i)!!;

            let init: StateInit = initOf HypersonicUserContract(monthlyDistributionData.walletAddress);
            let address: Address = contractAddress(init);

            send(SendParameters{
                    to: address,
                    value: ton("0.25"),
                    mode: SendIgnoreErrors,
                    body: MonthlyDistribution{
                        walletAddress: monthlyDistributionData.walletAddress,
                        memberRevenue: monthlyDistributionData.memberRevenue,
                        companyRevenue: monthlyDistributionData.companyRevenue,
                        subscriptionFee: monthlyDistributionData.subscriptionFee,
                        contractKey: monthlyDistributionData.contractKey
                    }.toCell()
                }
            );
       }
    }

    receive(monthlyDistributionSuccessfulData: MonthlyDistributionSuccessful){
        if (monthlyDistributionSuccessfulData.deactivated == false) {
            send(SendParameters{
                to: self.companyUniLevelUser,
                value: monthlyDistributionSuccessfulData.companyRevenue,
                mode: SendIgnoreErrors
            });
        }

        send(SendParameters{
                to: self.owner(),
                value: ton("0.20"), // return fees
                mode: SendIgnoreErrors
            }
        );
        
        emit(MonthlyDistributionSuccessfulEvent{
            walletAddress: monthlyDistributionSuccessfulData.walletAddress,
            memberRevenue: monthlyDistributionSuccessfulData.memberRevenue,
            companyRevenue: monthlyDistributionSuccessfulData.companyRevenue,
            subscriptionFee: monthlyDistributionSuccessfulData.subscriptionFee,
            endingMemberBalance: monthlyDistributionSuccessfulData.endingMemberBalance,
            deactivated: monthlyDistributionSuccessfulData.deactivated,
            matrixSubscriptionGracePeriodActive: monthlyDistributionSuccessfulData.matrixSubscriptionGracePeriodActive
        }.toCell());
    }

    receive(adminWithdrawalData: AdminWithdrawal){
        require(sender() == self.owner, "Only the owner can do the admin withdrawal.");
        require(adminWithdrawalData.amount <= myBalance() - ton("10"), "Insufficient funds in main contract to withdraw amoount. At least 10 TON must remain in the contract.");
        self.requireValidContractKey(adminWithdrawalData.contractKey);

        send(SendParameters{
                to: self.owner(),
                value: adminWithdrawalData.amount + ton("0.25"),
                mode: SendIgnoreErrors
            }
        );

        emit(AdminWithdrawalEvent{amount: adminWithdrawalData.amount}.toCell());
    }

    receive(preRegisterData: PreRegisterMember) {
        require(sender() == self.owner, "Only the owner can preregister members.");

        self.requireNotStopped();
        self.requireValidContractKey(preRegisterData.contractKey);

        self.numberOfUsers += 1;

        let userInit: StateInit = initOf HypersonicUserContract(preRegisterData.walletAddress);
        let userAddress: Address = contractAddress(userInit);

        // Set up the user contract with initial data
        send(SendParameters{
            to: userAddress,
            value: ton("0.3"), // Adjust as necessary for deployment costs
            mode: SendIgnoreErrors + SendPayGasSeparately,
            code: userInit.code,
            data: userInit.data,
            body: Register{
                walletAddress: preRegisterData.walletAddress,
                username: preRegisterData.username,
                upline: preRegisterData.upline,
                contractKey: preRegisterData.contractKey
            }.toCell()
        });

        // Set the initial package level and matrix position
        send(SendParameters{
            to: userAddress,
            value: ton("0.1"),
            mode: SendIgnoreErrors + SendPayGasSeparately,
            body: UpgradePlan{
                walletAddress: preRegisterData.walletAddress,
                targetPackageLevel: preRegisterData.packageLevel,
                targetPackageLevelPrice: 0, // Assuming no cost for initial setup
                payouts: emptyMap(), // No initial payouts
                contractKey: preRegisterData.contractKey
            }.toCell()
        });

       if (preRegisterData.matrixPosition != null && preRegisterData.subscriptionType != null) {
            // Place the user in the matrix
            send(SendParameters{
                to: userAddress,
                value: ton("0.1"),
                mode: SendIgnoreErrors + SendPayGasSeparately,
                body: ForcePlaceInMatrix{
                    walletAddress: preRegisterData.walletAddress,
                    contractKey: preRegisterData.contractKey,
                    subscriptionType: preRegisterData.subscriptionType, // Custom type for initial setups
                    subscriptionPrice: 0, // Assuming no cost for initial setup
                    parentUser: preRegisterData.matrixParentUser,
                    placementUnderParent: preRegisterData.matrixPosition
                }.toCell()
            });
       }
    }

    receive(preRegisterMemberSuccessfulData: PreRegisterMemberSuccessful){
         emit(PreRegisterMemberSuccessfulEvent{
            walletAddress: preRegisterMemberSuccessfulData.walletAddress,
            username: preRegisterMemberSuccessfulData.username,
            upline: preRegisterMemberSuccessfulData.upline,
            packageLevel: preRegisterMemberSuccessfulData.packageLevel,
            matrixParentUser: preRegisterMemberSuccessfulData.matrixParentUser,
            matrixPosition: preRegisterMemberSuccessfulData.matrixPosition,
            subscriptionType: preRegisterMemberSuccessfulData.subscriptionType
        }.toCell());
    }

    get fun companyUniLevelUserAddress(): Address {
        let init: StateInit = initOf HypersonicUserContract(self.companyUniLevelUser);
        let address: Address = contractAddress(init);

        return address;
    }

    get fun uniLevelUserAddress(userWalletAddress: Address): Address {
        let init: StateInit = initOf HypersonicUserContract(userWalletAddress);
        let address: Address = contractAddress(init);

        return address;
    }

    get fun numberOfUsers(): Int {
        return self.numberOfUsers;
    }

    get fun numberOfSubscribedUsers(): Int {
        return self.numberOfSubscribedUsers;
    }

    get fun balance(): Int {
        return myBalance();
    }

    get fun startDate(): Int {
        return self.startDate;
    }

    // receive(msg: ChangeOwner) is added automatically to transfer ownership
    // receive("Resume") is added automatically to allow owner to resume the contract
    // receive("Stop") is added automatically to allow owner to stop the contract
    // get fun stopped(): Bool is added automatically to query if contract is stopped
    // get fun owner(): Address is added automatically to query who the owner is
}

message UniLevelUser {
    username: String;
    walletAddress: Address;
    upline: Upline;
    invited: Invited;
    packageLevel: Int as int8;
    balance: Int as coins;
    registrationDate: Int?;
}

message MatrixUser {
    username: String;
    walletAddress: Address;
    matrixRegistrationDate: Int?;
    matrixExpirationDate: Int?;
    matrixSubscriptionType: String?;
    parentUser: Address?;
    leftChildUser: Address?;
    middleChildUser: Address?;
    rightChildUser: Address?;
    matrixStatuses: MatrixStatuses?;
}

message MatrixStatuses {
    matrixSubscriptionActive: Bool;
    matrixSubscriptionGracePeriodActive: Bool;
}

message NewMatrixUserReceived {
    walletAddress: Address;
    position: String;
}

message PayoutReceived {
    companyAddress: Address;
    amount: Int as coins;
}

message WithdrawUserContractTonBalance {
    amount: Int as coins;
}

contract HypersonicUserContract with Deployable {
    uniLevelRegistrationDate: Int?;

    matrixRegistrationDate: Int?;
    matrixExpirationDate: Int?;
    matrixSubscriptionType: String?;
    matrixSubscriptionActive: Bool;
    matrixSubscriptionGracePeriodActive: Bool;

    username: String;
    walletAddress: Address;

    upline: Upline;
    invited: Invited;

    packageLevel: Int;
    balance: Int;

    parentContract: Address;

    parentUser: Address?;
    leftChildUser: Address?;
    middleChildUser: Address?;
    rightChildUser: Address?;

    init(userWalletAddress: Address){
        self.uniLevelRegistrationDate = now();
        self.matrixSubscriptionType = "";
        self.parentContract = sender();
        self.walletAddress = userWalletAddress;
        self.username = "";
        self.packageLevel = 0;
        self.balance = 0;
        self.matrixSubscriptionActive = false;
        self.matrixSubscriptionGracePeriodActive = false;

        self.upline = Upline{mapping: emptyMap(), count: 5};
        self.invited = Invited{mapping: emptyMap(), count: 0};
    }

    fun requireSentFromParentContract() {
        require(sender() == self.parentContract, "Access denied");
    }

    fun requireSufficientTransactionFee() {
        require(context().value >= ton("0.25"), "You must attach an amount of TON greater than the transaction fee to pay for gas fees. Excess TON will be returned.");
    }

    receive(registrationData: Register){
        require(sender() == self.parentContract, "Access denied");

        self.username = registrationData.username;
        self.packageLevel = 0;
        self.balance = 0;
        self.upline = registrationData.upline;
        
        if (self.upline.count > 0) {
            let init: StateInit = initOf HypersonicUserContract(self.upline.mapping.get(1)!!);
            let inviterContractAddress: Address = contractAddress(init);

            send(SendParameters{
                    to: inviterContractAddress,
                    value: ton("0.03"),
                    mode: SendIgnoreErrors,
                    body: AddNewlyInvitedUser{inviterAddress: self.walletAddress}.toCell()
                }
            );
        }
    }

    receive(addNewlyInvitedUserData: AddNewlyInvitedUser){
        let validSenderAddress: Address = self.calculatedAddress(addNewlyInvitedUserData.inviterAddress);

        require(sender() == validSenderAddress, "Access denied");

        self.invited.mapping.set(self.invited.count + 1, addNewlyInvitedUserData.inviterAddress);
        self.invited.count += 1;
    }

    receive(depositData: Deposit){
        self.requireSentFromParentContract();

        self.balance += depositData.amount;

        send(SendParameters{
                to: sender(),
                value: context().value - ton("0.05"),
                mode: SendIgnoreErrors,
                body: DepositSuccessful{walletAddress: self.walletAddress}.toCell()
            }
        );
    }

    receive(withdrawData: Withdraw){
        self.requireSentFromParentContract();
        require(withdrawData.amount <= self.balance, "Insufficient funds to withdraw amount");

        self.balance -= withdrawData.amount;

        send(SendParameters{
                to: sender(),
                value: context().value - ton("0.05"),
                mode: SendIgnoreErrors,
                body: WithdrawalSuccessful{
                    walletAddress: withdrawData.walletAddress,
                    amount: withdrawData.amount
                }.toCell()
            }
        );
    }

    receive(upgradePlanData: UpgradePlan){
        self.requireSentFromParentContract();
    
        require(upgradePlanData.targetPackageLevel <= 7, "Cannot upgrade past level 7");

        require(upgradePlanData.targetPackageLevelPrice >= 0, "Package level does not exist");
        require(upgradePlanData.targetPackageLevelPrice <= self.balance, "Insufficient funds to upgrade plan");

        self.packageLevel = upgradePlanData.targetPackageLevel;
        self.balance -= upgradePlanData.targetPackageLevelPrice;

        send(SendParameters{
                to: sender(),
                value: context().value - ton("0.07"),
                mode: SendIgnoreErrors,
                body: UpgradePlanSuccessful{
                    walletAddress: upgradePlanData.walletAddress,
                    targetLevel: self.packageLevel,
                    payouts: upgradePlanData.payouts
                }.toCell()
            }
        );
    }

    receive(payoutReceivedData: PayoutReceived){
        self.requireSentFromParentContract();

        self.balance += payoutReceivedData.amount;      
    }

    receive(withdrawUserContractTonBalanceData: WithdrawUserContractTonBalance){
        require(context().value >= ton("0.05"),
            "You must attach an amount of TON greater than the withdrawal fees to pay for gas fees. Excess TON will be returned."
        );

        let minimumRunningBalance: Int = ton("0.10");

        require(sender() == self.walletAddress, "Access denied");
        require(myBalance() - withdrawUserContractTonBalanceData.amount >= minimumRunningBalance, "Insufficient funds to withdraw amount, must have running balance of at least 0.10 TON");

        send(SendParameters{
                to: sender(),
                value: withdrawUserContractTonBalanceData.amount + ton("0.05"),
                mode: SendIgnoreErrors + SendPayGasSeparately
            }
        );
    }

    receive(subscribeToMatrixData: SubscribeToMatrix){
        self.requireSentFromParentContract();
    
        require(self.balance >= subscribeToMatrixData.subscriptionPrice + ton("0.20"), "Insufficient funds to subscribe to matrix");

        require(self.packageLevel >= 1, "Must upgrade package level to at least 1 before subscribing to matrix");
        require(subscribeToMatrixData.placementUnderParent == "left" || subscribeToMatrixData.placementUnderParent == "middle" || subscribeToMatrixData.placementUnderParent == "right", "Invalid placement");
        require(subscribeToMatrixData.subscriptionType == "yearly-within-30-days" || subscribeToMatrixData.subscriptionType == "yearly-after-30-days" || subscribeToMatrixData.subscriptionType == "monthly-within-30-days" || subscribeToMatrixData.subscriptionType == "monthly-after-30-days", "Invalid subscription type");

        if (subscribeToMatrixData.subscriptionType == "monthly-within-30-days") {
            require(self.invited.count >= 2, "You must have at least 2 referrals to subscribe to matrix for this subscription type");
        }

        let timeNow: Int = now();

        // NOTE: subscription type will be calculated off chain to ensure it can be fixed and modified in the future.

        self.matrixExpirationDate = timeNow + 365 * 24 * 60 * 60;
        self.matrixSubscriptionType = subscribeToMatrixData.subscriptionType;
        self.matrixSubscriptionActive = true;
        self.matrixSubscriptionGracePeriodActive = false;

        self.balance -= subscribeToMatrixData.subscriptionPrice;

        // NOTE: We will pre-determine where they will fall under so that it's easier to fix in the future, costs less gas, and we can customize where special users go if we need to

        if (self.matrixRegistrationDate == null) { // It means that this is their first time joining
            self.matrixRegistrationDate = now();

            self.parentUser = subscribeToMatrixData.parentUser;

            let parentUserAddress: Address = self.calculatedAddress(subscribeToMatrixData.parentUser);

            send(SendParameters{
                to: parentUserAddress,
                value: context().value / 2,
                mode: SendIgnoreErrors,
                body: NewMatrixUserReceived{
                    walletAddress: self.walletAddress,
                    position: subscribeToMatrixData.placementUnderParent
                }.toCell()
            });
        }

        send(SendParameters{
            to: sender(),
            value: 0,
            mode: SendIgnoreErrors + SendRemainingValue,
            body: SubscribeToMatrixSuccessful{
                walletAddress: self.walletAddress,
                subscriptionType: self.matrixSubscriptionType!!,
                expirationDate: self.matrixExpirationDate!!
            }.toCell()
        });
    }

    receive(newMatrixUserReceivedData: NewMatrixUserReceived){
        let validSenderAddress: Address = self.calculatedAddress(newMatrixUserReceivedData.walletAddress);

        require(sender() == validSenderAddress, "Access denied");
        require(newMatrixUserReceivedData.position == "left" || newMatrixUserReceivedData.position == "middle" || newMatrixUserReceivedData.position == "right", "Invalid position");

        if (newMatrixUserReceivedData.position == "left") {
            require(self.leftChildUser == null, "Left child already exists");
            self.leftChildUser = newMatrixUserReceivedData.walletAddress;
        } else if (newMatrixUserReceivedData.position == "middle") {
            require(self.middleChildUser == null, "Middle child already exists");
            self.middleChildUser = newMatrixUserReceivedData.walletAddress;
        } else if (newMatrixUserReceivedData.position == "right") {
            require(self.rightChildUser == null, "Right child already exists");
            self.rightChildUser = newMatrixUserReceivedData.walletAddress;
        }

        send(SendParameters{
            to: sender(),
            value: 0,
            mode: SendIgnoreErrors + SendRemainingValue
        });
    }

    receive(forcePlaceInMatrixData: ForcePlaceInMatrix){
        self.requireSentFromParentContract();

        // Directly set the matrix properties without checking conditions
        
        self.matrixSubscriptionType = forcePlaceInMatrixData.subscriptionType;

        let timeNow: Int = now();

        self.matrixRegistrationDate = now();
        self.matrixExpirationDate = timeNow + 365 * 24 * 60 * 60;

        self.matrixSubscriptionActive = true;
        self.matrixSubscriptionGracePeriodActive = false;

        if (forcePlaceInMatrixData.parentUser != null) {
            self.parentUser = forcePlaceInMatrixData.parentUser;
            let parentUserAddress: Address = self.calculatedAddress(forcePlaceInMatrixData.parentUser!!);

            send(SendParameters{
                to: parentUserAddress,
                value: context().value / 2,
                mode: SendIgnoreErrors,
                body: NewMatrixUserReceived{
                    walletAddress: self.walletAddress,
                    position: forcePlaceInMatrixData.placementUnderParent!!
                }.toCell()
            });
        }
    }

    receive(monthlyDistributionData: MonthlyDistribution){
        self.requireSentFromParentContract();

        let newBalance: Int = self.balance + monthlyDistributionData.memberRevenue;
        let deactivated: Bool = false;
        
        if (newBalance < monthlyDistributionData.subscriptionFee) {
            deactivated = true;

            if (self.matrixExpirationDate!! <= now()) {
                self.matrixSubscriptionActive = false;
            } else {
                 if (self.matrixSubscriptionGracePeriodActive == false) {
                    self.matrixSubscriptionGracePeriodActive = true;
                } else {
                    self.matrixSubscriptionActive = false;
                    self.matrixSubscriptionGracePeriodActive = false;
                }
            }
        } else {
            self.matrixSubscriptionGracePeriodActive = false;

            self.balance = newBalance - monthlyDistributionData.subscriptionFee;
        }

        send(SendParameters{
                to: self.parentContract,
                value: 0,
                mode: SendIgnoreErrors + SendRemainingValue,
                body: MonthlyDistributionSuccessful{
                    walletAddress: monthlyDistributionData.walletAddress,
                    memberRevenue: monthlyDistributionData.memberRevenue,
                    companyRevenue: monthlyDistributionData.companyRevenue,
                    subscriptionFee: monthlyDistributionData.subscriptionFee,
                    matrixSubscriptionGracePeriodActive: self.matrixSubscriptionGracePeriodActive,
                    endingMemberBalance: self.balance,
                    deactivated: deactivated
                }.toCell()
            }
        );

    }

    receive(){
        dump("empty message received");
    }

    receive("Registered"){
        dump(self.walletAddress);
        dump("Successfully registered");
    }

    get fun getUplineAddress(uplineLevel: Int): Address? {
        let uplineAddress: Address? = self.upline.mapping.get(uplineLevel);
        return uplineAddress;
    }

    get fun invited(): Invited {
        return self.invited;
    }

    get fun myAddress(): Address {
        return myAddress();
    }

    get fun balance(): Int {
        return myBalance();
    }

    get fun calculatedAddress(userWalletAddress: Address): Address {
        let init: StateInit = initOf HypersonicUserContract(userWalletAddress);
        return contractAddress(init);
    }

    get fun uniLevelUserData(): UniLevelUser {
        return
            UniLevelUser{
                username: self.username,
                walletAddress: self.walletAddress,
                upline: self.upline,
                invited: self.invited,
                packageLevel: self.packageLevel,
                balance: self.balance,
                registrationDate: self.uniLevelRegistrationDate
            };
    }

    get fun username(): String {
        return self.username;
    }

    get fun upline(): Upline {
        return self.upline;
    }

    get fun packageLevel(): Int {
        return self.packageLevel;
    }

    get fun unilevelRegistrationDate(): Int? {
        return self.uniLevelRegistrationDate;
    }

    get fun matrixUserData(): MatrixUser {
        return MatrixUser{
            username: self.username,
            walletAddress: self.walletAddress,
            matrixRegistrationDate: self.matrixRegistrationDate,
            matrixExpirationDate: self.matrixExpirationDate,
            matrixSubscriptionType: self.matrixSubscriptionType,
            parentUser: self.parentUser,
            leftChildUser: self.leftChildUser,
            middleChildUser: self.middleChildUser,
            rightChildUser: self.rightChildUser,
            matrixStatuses: MatrixStatuses{
                matrixSubscriptionActive: self.matrixSubscriptionActive,
                matrixSubscriptionGracePeriodActive: self.matrixSubscriptionGracePeriodActive
            }
        };
    }

    get fun userBalance(): Int {
        return self.balance;
    }

    get fun matrixRegistrationDate(): Int? {
        return self.matrixRegistrationDate;
    }
}
