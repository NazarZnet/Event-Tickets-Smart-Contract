use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Event {
    pub admin: Pubkey,
    pub vault: Pubkey,
    #[max_len(100)]
    pub name: String,
    #[max_len(500)]
    pub description: String,
    pub start_time: i64,
    pub end_time: i64,
    pub ticket_price: u64,
    pub total_tickets: u32,
    pub tickets_sold: u32,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct EventCounter {
    pub admin: Pubkey,
    pub next_event_id: u64,
}

#[account]
#[derive(InitSpace)]
pub struct Ticket {
    pub event: Pubkey,
    pub mint: Pubkey,
    pub owner: Pubkey,
    pub valid_until: i64,
    pub used: bool,
    pub bump: u8,
}
