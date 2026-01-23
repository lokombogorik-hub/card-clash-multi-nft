use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::collections::LookupMap;
use near_sdk::{
    env, near_bindgen, AccountId, Promise, PromiseOrValue, PanicOnDefault, Gas, require,
    serde::{Deserialize, Serialize},
};

const GAS_NFT_TRANSFER: Gas = Gas::from_tgas(25);

#[derive(BorshDeserialize, BorshSerialize)]
pub struct Deposit {
    pub nft_contract_id: AccountId,
    pub token_id: String,
    pub original_owner_id: AccountId,
    pub deposited_by: AccountId,
}

#[derive(BorshDeserialize, BorshSerialize)]
pub struct MatchState {
    pub player_a: AccountId,
    pub player_b: AccountId,
    pub deposit_a: Option<Deposit>,
    pub deposit_b: Option<Deposit>,
    pub finished: bool,
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct TransferCallMsg {
    pub match_id: String,
    pub side: String, // "A" | "B"
    pub player_a: AccountId,
    pub player_b: AccountId,
}

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
pub struct Escrow {
    matches: LookupMap<String, MatchState>,
}

#[near_bindgen]
impl Escrow {
    #[init]
    pub fn new() -> Self {
        Self {
            matches: LookupMap::new(b"m"),
        }
    }

    /// Winner claims loser NFT.
    pub fn claim(
        &mut self,
        match_id: String,
        winner: AccountId,
        loser_nft_contract_id: AccountId,
        loser_token_id: String,
    ) -> Promise {
        let caller = env::predecessor_account_id();
        require!(caller == winner, "Only winner can claim");

        let mut st = self.matches.get(&match_id).expect("Match not found");
        require!(!st.finished, "Already finished");

        let dep_a = st.deposit_a.as_ref().expect("Deposit A missing");
        let dep_b = st.deposit_b.as_ref().expect("Deposit B missing");

        require!(winner == st.player_a || winner == st.player_b, "Winner must be a player");

        let loser_dep = if winner == st.player_a { dep_b } else { dep_a };

        require!(
            loser_dep.nft_contract_id == loser_nft_contract_id && loser_dep.token_id == loser_token_id,
            "Chosen token must belong to loser deposit"
        );

        st.finished = true;
        self.matches.insert(&match_id, &st);

        ext_nft::ext(loser_nft_contract_id)
            .with_attached_deposit(1)
            .with_static_gas(GAS_NFT_TRANSFER)
            .nft_transfer(winner, loser_token_id, None, None)
    }

    pub fn get_match(&self, match_id: String) -> Option<MatchView> {
        self.matches.get(&match_id).map(|st| MatchView {
            match_id,
            player_a: st.player_a,
            player_b: st.player_b,
            has_deposit_a: st.deposit_a.is_some(),
            has_deposit_b: st.deposit_b.is_some(),
            finished: st.finished,
        })
    }
}

#[near_bindgen]
impl near_contract_standards::non_fungible_token::receiver::NonFungibleTokenReceiver for Escrow {
    fn nft_on_transfer(
        &mut self,
        sender_id: AccountId,
        previous_owner_id: AccountId,
        token_id: String,
        msg: String,
    ) -> PromiseOrValue<bool> {
        let nft_contract_id = env::predecessor_account_id();

        let parsed: TransferCallMsg =
            near_sdk::serde_json::from_str(&msg).expect("Invalid msg JSON");

        require!(parsed.side == "A" || parsed.side == "B", "side must be A or B");
        require!(parsed.player_a != parsed.player_b, "players must differ");

        let mut st = self.matches.get(&parsed.match_id).unwrap_or(MatchState {
            player_a: parsed.player_a.clone(),
            player_b: parsed.player_b.clone(),
            deposit_a: None,
            deposit_b: None,
            finished: false,
        });

        require!(st.player_a == parsed.player_a && st.player_b == parsed.player_b, "Match players mismatch");
        require!(!st.finished, "Match already finished");

        let dep = Deposit {
            nft_contract_id,
            token_id,
            original_owner_id: previous_owner_id,
            deposited_by: sender_id,
        };

        if parsed.side == "A" {
            require!(st.deposit_a.is_none(), "Deposit A already set");
            st.deposit_a = Some(dep);
        } else {
            require!(st.deposit_b.is_none(), "Deposit B already set");
            st.deposit_b = Some(dep);
        }

        self.matches.insert(&parsed.match_id, &st);

        // false => keep token in escrow
        PromiseOrValue::Value(false)
    }
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct MatchView {
    pub match_id: String,
    pub player_a: AccountId,
    pub player_b: AccountId,
    pub has_deposit_a: bool,
    pub has_deposit_b: bool,
    pub finished: bool,
}

#[near_sdk::ext_contract(ext_nft)]
pub trait ExtNFT {
    fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        approval_id: Option<u64>,
        memo: Option<String>,
    );
}