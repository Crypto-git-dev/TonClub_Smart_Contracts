import "@stdlib/deploy";
import "@stdlib/ownable";
import "@stdlib/stoppable";

message LogEventMintRecord {
    minter: Address;
    item_id: Int;
    generate_number: Int;
}
message(0x693d3950) GetRoyaltyParams {
    query_id: Int as uint64;
}
message(0xa8cb00ad) ReportRoyaltyParams {
    query_id: Int as uint64;
    numerator: Int as uint16;
    denominator: Int as uint16;
    destination: Address;
}
message UpdateCollectionContent { 
    query_id: Int as uint64;
    new_content: Cell;
    numerator:  Int as uint16;
    denominator: Int as uint16;
    destination: Address;
}
struct CollectionData {
    next_item_index: Int;
    collection_content: Cell;
    owner_address: Address;
}
struct RoyaltyParams {
    numerator: Int;
    denominator: Int;
    destination: Address;
}
message(0x5fcc3d14) Transfer {
    query_id: Int as uint64;
    new_owner: Address;
    response_destination: Address?;
    custom_payload: Cell?;
    forward_amount: Int as coins;
    forward_payload: Slice as remaining;
}
message(0x05138d91) OwnershipAssigned {
    query_id: Int as uint64;
    prev_owner: Address;
    forward_payload: Slice as remaining;
}
message(0xd53276db) Excesses {
    query_id: Int as uint64;
}
message(0x2fcb26a2) GetStaticData {
    query_id: Int as uint64;
}
message(0x8b771735) ReportStaticData {
    query_id: Int as uint64;
    index_id: Int;
    collection: Address;
}
message MultiMint {
    amount: Int?;
}
message Burn {
    zeroAddress: Address;
}
message UpdateNFTContent {
    new_content: Cell;
}
message InitialTransfer {
    newOwner: Address;
    amount: Int?;
}
struct GetNftData {
    is_initialized: Bool;
    index: Int;
    collection_address: Address;
    owner_address: Address;
    individual_content: Cell;
}

const minTonsForStorage: Int = ton("0.02");
const gasConsumption: Int = ton("0.01");
const feesperNFT : Int = ton("0.04");

contract NftCollection with Deployable, Resumable, OwnableTransferable {
    owner: Address;
    stopped: Bool;
    next_item_index: Int as uint32 = 0;
    transfer_item_index: Int as uint32 = 0;
    royalty_params: RoyaltyParams;                      
    collection_content: Cell;   
    nft_content: Cell;

    init(owner_address: Address, collection_content: Cell, nft_content: Cell, royalty_params: RoyaltyParams) {
        self.owner = owner_address;
        self.stopped = false;
        self.collection_content = collection_content; 
        self.nft_content = nft_content; 
        self.royalty_params = royalty_params;
    }

    receive() {
        dump("Funds received");
    }

    receive("InitFee") {
        dump("StorageFee");
    }

    receive("Mint") {
        let ctx: Context = context(); // get sender Info
        let msgValue: Int = ctx.value;
        let tonBalanceBeforeMsg: Int = myBalance() - msgValue;
        let storageFee: Int = minTonsForStorage - min(tonBalanceBeforeMsg, minTonsForStorage);
        msgValue = msgValue - (storageFee + gasConsumption);

        self.mint(ctx.sender, msgValue);
    }

    receive(msg: MultiMint) {
        self.requireOwner();
        let ctx: Context = context(); // get sender Info
        repeat(msg.amount!!) {
            require(myBalance() >= (ton("0.05") + feesperNFT), "insufficient Balance");
            self.mint(ctx.sender, feesperNFT);
            // emit LogEventMintRecord { minter: sender(), item_id: self.next_item_index, generate_number: nativeRandom() }.toCell();
        }
    }

    receive(msg: InitialTransfer) {
        self.requireOwner();
        repeat(msg.amount!!) {
            require(self.transfer_item_index >= 0, "non-sequential NFTs");
            require(self.transfer_item_index <= self.next_item_index, "non-equential NFTs");
            require(myBalance() >= (ton("0.05") + feesperNFT), "insufficient Balance");
            self.initTransfer(msg.newOwner, feesperNFT);
        }
    }
    // ===== Private Methods ===== //
    fun mint(sender: Address, msgValue: Int) {
        require(self.next_item_index >= 0, "non-sequential NFTs");
        let nft_init: StateInit = self.getNftItemInit(self.next_item_index);
        send(SendParameters {
            to: contractAddress(nft_init), 
            value: msgValue, 
            bounce: false,
            mode: SendIgnoreErrors,
            body: Transfer {
                query_id: 0,
                new_owner: sender,
                response_destination: self.owner,
                custom_payload: self.nft_content,
                forward_amount: 0,
                forward_payload: emptySlice()
            }.toCell(),
            code: nft_init.code,
            data: nft_init.data
        });
        self.next_item_index = self.next_item_index + 1;
    }

    fun initTransfer(newOwner: Address, msgValue: Int) {
        let nft_init: StateInit = self.getNftItemInit(self.transfer_item_index);
        send(SendParameters {
            to: contractAddress(nft_init), 
            value: msgValue, 
            bounce: false,
            mode: SendIgnoreErrors,
            body: Transfer {
                query_id: 0,
                new_owner: newOwner,
                response_destination: self.owner,
                forward_amount: 0,
                forward_payload: emptySlice()
            }.toCell()
        });
        self.transfer_item_index = self.transfer_item_index + 1;
    }

    receive(msg: GetRoyaltyParams) {   
        let ctx: Context = context(); // get sender Info
        send(SendParameters {
            to: ctx.sender,
            value: 0,
            mode: 64, 
            bounce: false,
            body: ReportRoyaltyParams {
                query_id: msg.query_id,
                numerator: self.royalty_params.numerator,
                denominator: self.royalty_params.denominator,
                destination: self.owner
            }.toCell()
        });        
    }

    receive(msg: UpdateCollectionContent) {
        // Only Owner can update it.
        self.requireOwner();
        self.collection_content = msg.new_content;
        self.royalty_params = RoyaltyParams {
            numerator: msg.numerator,
            denominator: msg.denominator,
            destination: msg.destination
        };
    }

    receive(msg: UpdateNFTContent) {
        self.requireOwner();
        self.nft_content = msg.new_content;
    }

    receive("withDraw") {
        // Only Owner can withdraw.
        self.requireOwner();
        send(SendParameters {
            to: self.owner(),
            bounce: true,
            value: myBalance() - context().value - ton("0.03"),
            mode: (SendIgnoreErrors + SendRemainingValue)
        });
    }

    // ------------------ Get Functions ------------------ //
    get fun get_collection_data(): CollectionData {     
        let b: StringBuilder = beginString();
        let collectionDataString: String = self.collection_content.asSlice().asString();
        b.append(collectionDataString);
        b.append("meta.json");
        return CollectionData {
            next_item_index: self.next_item_index,
            collection_content: b.toCell(), 
            owner_address: self.owner
        };
    }

    get fun get_nft_address_by_index(item_index: Int): Address? {      
        let initCode: StateInit = self.getNftItemInit(item_index);
        return contractAddress(initCode);
    }

    get fun getNftItemInit(item_index: Int): StateInit {
        return initOf NftItem(self.owner, myAddress(), item_index);
    }
    
    get fun get_nft_content(index: Int, individual_content: Cell): Cell { 
        let b: StringBuilder = beginString();
        let ic: String = individual_content.asSlice().asString();
        b.append(ic);
        return b.toCell();
    }

    get fun royalty_params(): RoyaltyParams {
        return self.royalty_params;
    }
    
    get fun get_transfer_item_index(): Int {
        return self.transfer_item_index;
    }
}

contract NftItem with Deployable, Resumable, OwnableTransferable {
    collection_address: Address;
    item_index: Int; 
    is_initialized: Bool;
    is_burned: Bool;
    owner : Address;
    stopped: Bool;
    individual_content: Cell?;

    init(collection_owner: Address, collection_address: Address, item_index: Int){
        require(sender() == collection_address, "not from collection");
        self.owner = collection_owner;
        self.collection_address = collection_address;
        self.item_index = item_index;
        self.is_initialized = false;
        self.is_burned = false;
        self.stopped = false;
    }

    receive(msg: Transfer){
        require(!self.is_burned, "NFT is burned");
        let ctx: Context = context();
        let msgValue: Int = self.msgValue(ctx.value);
        
        if (self.is_initialized == false) {  // Initial Transfer, aka the "Minting" of the NFT
            require(ctx.sender == self.collection_address, "initialized tx need from collection");
            self.is_initialized = true;
            self.owner = msg.new_owner;
            self.individual_content = msg.custom_payload;
            send(SendParameters{
                to: msg.response_destination!!,
                value: msgValue,
                mode: SendPayGasSeparately,
                body: Excesses { query_id: msg.query_id }.toCell()
            });
        } else { 
            if(ctx.sender == self.collection_address) {
                require(ctx.sender == self.collection_address, "initialized transfer need from collection");
                self.owner = msg.new_owner;
                send(SendParameters{
                    to: msg.response_destination!!,
                    value: msgValue,
                    mode: SendPayGasSeparately,
                    body: Excesses { query_id: msg.query_id }.toCell()
                });
            }
            else {
                require(ctx.sender == self.owner, "not owner");
                self.owner = msg.new_owner;  // change current owner to the new_owner
                if (msg.forward_amount > 0) {
                    send(SendParameters{
                        to: msg.new_owner,
                        value: msg.forward_amount,
                        mode:  SendPayGasSeparately, 
                        bounce: true,
                        body: OwnershipAssigned{
                            query_id: msg.query_id,
                            prev_owner: ctx.sender,
                            forward_payload: msg.forward_payload
                        }.toCell()
                    }); 
                }

                msgValue = msgValue - ctx.readForwardFee(); 
                if (msg.response_destination != null) { 
                    send(SendParameters{ 
                        to: msg.response_destination!!,
                        value: msgValue - msg.forward_amount,
                        mode: SendPayGasSeparately,
                        bounce: true,
                        body: Excesses { query_id: msg.query_id }.toCell()
                    });
                }
            }
        }
    }
    receive(msg: Burn) {
        let ctx: Context = context();
        require(ctx.sender == self.owner, "Only owner can burn the NFT");
        require(!self.is_burned, "NFT is already burned");
        self.is_burned = true;
        self.owner = msg.zeroAddress;
        self.individual_content = null;
        self.stopped = true;
        // self.collection_address = msg.zeroAddress;
        
        send(SendParameters {
            to: ctx.sender,
            value: 0,
            bounce: true,
            mode: SendRemainingBalance + SendIgnoreErrors
        })
    }
    
    receive(msg: GetStaticData){ 
        require(!self.is_burned, "NFT is burned");
        let ctx: Context = context();
        send(SendParameters {
            to: ctx.sender,
            value: 0,
            mode: 64,  // (return msg amount except gas fees) 
            bounce: true,
            body: ReportStaticData{
                query_id: msg.query_id,
                index_id: self.item_index,
                collection: self.collection_address
            }.toCell()
        });
    }

    fun msgValue(value: Int): Int {
        let tonBalanceBeforeMsg: Int = myBalance() - value;
        let storageFee: Int = minTonsForStorage - min(tonBalanceBeforeMsg, minTonsForStorage);
        return value - (storageFee + gasConsumption);
    }

    // --------- Get Function  --------- //
    get fun get_nft_data(): GetNftData {
        require(!self.is_burned, "NFT is burned");
        let b: StringBuilder = beginString();
        let collectionData: String = (self.individual_content!!).asSlice().asString();
        b.append(collectionData);
        b.append(self.item_index.toString());
        b.append(".json");

        return GetNftData {
            is_initialized: self.is_initialized, 
            index: self.item_index, 
            collection_address: self.collection_address, 
            owner_address: self.owner,
            individual_content: b.toCell()
        };
    }
}
