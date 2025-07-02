mod constants;
mod errors;
mod instructions;
mod state;

use anchor_lang::prelude::*;
use instructions::*;
declare_id!("9iTfUKAVuJjV2Hb94LFjb1uHUcHYLvr2nXrZxiARwDdZ");

#[program]
pub mod event_tickets {

    use super::*;

    pub fn create_event(
        ctx: Context<CreateEvent>,
        name: String,
        description: String,
        start_time: i64,
        end_time: i64,
        ticket_price: u64,
        total_tickets: u32,
    ) -> Result<()> {
        create_event_handler(
            ctx,
            name,
            description,
            start_time,
            end_time,
            ticket_price,
            total_tickets,
        )
    }
    pub fn mint_ticket(ctx: Context<MintTicket>, event_id: u64) -> Result<()> {
        mint_ticket_handler(ctx, event_id)
    }
}
