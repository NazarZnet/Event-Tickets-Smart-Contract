use crate::constants::{DISCRIMINATOR_LENGHT, EVENT_SEED};
use crate::errors::EventError;
use crate::state::{Event, Ticket};
use anchor_lang::{prelude::*, system_program};
use anchor_spl::associated_token::AssociatedToken;

use anchor_spl::token::{Mint, MintTo, Token, TokenAccount};
#[derive(Accounts)]
#[instruction(event_id: u64)]
pub struct MintTicket<'info> {
    #[account(
        mut,
        // seeds = [EVENT_SEED, event.admin.as_ref(), event_id.to_be_bytes().as_ref()],
        // bump = event.bump,
    )]
    pub event: Account<'info, Event>,

    /// CHECK: This is a PDA vault account for the event, only used to hold SOL for the event. No data is stored, only lamports are transferred in/out by the program.
    #[account(mut, address = event.vault)]
    pub event_vault: AccountInfo<'info>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    // PDA to store ticket info
    #[account(
        init,
        payer = buyer,
        space = Ticket::INIT_SPACE + DISCRIMINATOR_LENGHT,
        seeds = [b"ticket", event.key().as_ref(), &event.tickets_sold.to_be_bytes()],
        bump,
    )]
    pub ticket: Account<'info, Ticket>,

    // Mint for the NFT ticket (unique for each ticket)
    #[account(
        init,
        payer = buyer,
        mint::decimals = 0,
        mint::authority = ticket,
        mint::freeze_authority = ticket,
        seeds = [b"ticket_mint", event.key().as_ref(), &event.tickets_sold.to_be_bytes()],
        bump
    )]
    pub ticket_mint: Account<'info, Mint>,

    // Associated Token Account for the buyer to hold the NFT
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = ticket_mint,
        associated_token::authority = buyer,
    )]
    pub buyer_ticket_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn mint_ticket_handler(ctx: Context<MintTicket>, _event_id: u64) -> Result<()> {
    let event = &mut ctx.accounts.event;

    require!(
        event.tickets_sold < event.total_tickets,
        EventError::InvalidTicketCount
    );

    let price = event.ticket_price;
    let buyer_lamports = **ctx.accounts.buyer.to_account_info().lamports.borrow();
    require!(buyer_lamports >= price, EventError::InsufficientFunds);

    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to: ctx.accounts.event_vault.to_account_info(),
            },
        ),
        price,
    )?;

    let cpi_accounts = MintTo {
        mint: ctx.accounts.ticket_mint.to_account_info(),
        to: ctx.accounts.buyer_ticket_ata.to_account_info(),
        authority: ctx.accounts.ticket.to_account_info(),
    };
    let event_pubkey = event.key();
    let seeds = &[
        b"ticket",
        event_pubkey.as_ref(),
        &event.tickets_sold.to_be_bytes(),
        &[ctx.bumps.ticket],
    ];
    let signer = &[&seeds[..]];
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer,
    );
    anchor_spl::token::mint_to(cpi_ctx, 1)?;

    let ticket = &mut ctx.accounts.ticket;
    ticket.event = event_pubkey;
    ticket.mint = ctx.accounts.ticket_mint.key();
    ticket.owner = ctx.accounts.buyer.key();
    ticket.valid_until = event.end_time;
    ticket.used = false;
    ticket.bump = ctx.bumps.ticket;

    event.tickets_sold = event.tickets_sold.checked_add(1).unwrap_or_default();
    Ok(())
}
