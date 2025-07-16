use anchor_lang::prelude::*;
use anchor_lang::solana_program::rent::{
    DEFAULT_EXEMPTION_THRESHOLD, DEFAULT_LAMPORTS_PER_BYTE_YEAR,
};
use anchor_lang::system_program;
use anchor_lang::system_program::{transfer, Transfer};
use anchor_spl::token_2022::{mint_to, MintTo};
use anchor_spl::token_interface::{token_metadata_initialize, TokenMetadataInitialize};
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use spl_token_metadata_interface::state::TokenMetadata;
use spl_type_length_value::variable_len_pack::VariableLenPack;

use crate::{
    constants::{DISCRIMINATOR_LENGHT, EVENT_SEED, TICKET_MINT_SEED, TICKET_SEED, VAULT_SEED},
    errors::EventError,
    state::{Event, EventVault, Ticket},
};
/// Contextual accounts required to mint a ticket NFT for an event.
#[derive(Accounts)]
#[instruction(event_id: u64)]
pub struct MintTicket<'info> {
    /// The event account for which the ticket is being minted.
    /// This account is validated using seeds to ensure it matches the `event_id`.
    #[account(
        mut,
        seeds = [EVENT_SEED, event.admin.as_ref(), event_id.to_be_bytes().as_ref()],
        bump = event.bump,
    )]
    pub event: Account<'info, Event>,

    /// The event's vault account, where the ticket payment will be sent.
    /// The address is checked to ensure it matches the one stored in the event account.
    #[account(
        mut,
        seeds = [VAULT_SEED, event.key().as_ref()],
        bump
    )]
    pub event_vault: Account<'info, EventVault>,

    /// The buyer of the ticket. Must be a signer.
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// The PDA account that will store the ticket's metadata.
    #[account(
        init,
        payer = buyer,
        space = Ticket::INIT_SPACE + DISCRIMINATOR_LENGHT,
        seeds = [TICKET_SEED, event.key().as_ref(), event.tickets_sold.to_be_bytes().as_ref()],
        bump,
    )]
    pub ticket: Account<'info, Ticket>,

    /// The SPL token mint for the ticket NFT. Each ticket has a unique mint.    
    #[account(
        init,
        payer = buyer,
        mint::decimals = 0,
        mint::authority = ticket,  // The ticket PDA is the mint authority
        mint::freeze_authority = ticket, // and the freeze authority
        extensions::metadata_pointer::authority = ticket,
        extensions::metadata_pointer::metadata_address = ticket_mint,
        extensions::permanent_delegate::delegate = event.admin,
        extensions::close_authority::authority = event.admin,
        seeds = [TICKET_MINT_SEED, event.key().as_ref(), event.tickets_sold.to_be_bytes().as_ref()],
        bump
    )]
    pub ticket_mint: InterfaceAccount<'info, Mint>,

    /// The buyer's Associated Token Account (ATA) to receive the ticket NFT.
    /// It will be created if it does not exist.
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::token_program = token_program,
        associated_token::mint = ticket_mint,
        associated_token::authority = buyer,
    )]
    pub buyer_ticket_ata: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Handles the logic for minting a new ticket NFT.
///
/// # Arguments
///
/// * `ctx` - The context containing all necessary accounts.
/// * `_event_id` - The ID of the event, used for PDA validation in the account constraints.
///
/// # Returns
///
/// An empty `Result` indicating success or failure.
pub fn mint_ticket_handler(ctx: Context<MintTicket>, _event_id: u64) -> Result<()> {
    let event = &mut ctx.accounts.event;
    let clock = Clock::get()?;

    require!(
        event.end_time > clock.unix_timestamp,
        EventError::EventEnded
    );
    require!(
        event.tickets_sold < event.total_tickets + event.tickets_returned,
        EventError::EventSoldOut
    );
    require!(
        **ctx.accounts.buyer.to_account_info().lamports.borrow() >= event.ticket_price,
        EventError::InsufficientFunds
    );

    // Payment Transfer
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to: ctx.accounts.event_vault.to_account_info(),
            },
        ),
        event.ticket_price,
    )?;

    // Initialize Ticket Mint Metadata
    let nft_name = format!("{} #{}", event.name, event.tickets_sold);

    let event_pubkey = event.key();
    let ticket_signer_seeds = &[
        TICKET_SEED,
        event_pubkey.as_ref(),
        &event.tickets_sold.to_be_bytes(),
        &[ctx.bumps.ticket],
    ];
    let signer = &[&ticket_signer_seeds[..]];

    let token_metadata = TokenMetadata {
        name: nft_name.clone(),
        symbol: event.symbol.clone(),
        uri: event.metadata_uri.clone(),
        ..Default::default()
    };
    let data_len = 4 + token_metadata.get_packed_len()?;
    let lamports =
        data_len as u64 * DEFAULT_LAMPORTS_PER_BYTE_YEAR * DEFAULT_EXEMPTION_THRESHOLD as u64;

    transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to: ctx.accounts.ticket_mint.to_account_info(),
            },
        ),
        lamports,
    )?;

    token_metadata_initialize(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TokenMetadataInitialize {
                program_id: ctx.accounts.token_program.to_account_info(),
                mint: ctx.accounts.ticket_mint.to_account_info(),
                metadata: ctx.accounts.ticket_mint.to_account_info(),
                mint_authority: ctx.accounts.ticket.to_account_info(),
                update_authority: ctx.accounts.ticket.to_account_info(),
            },
            signer,
        ),
        nft_name,
        event.symbol.clone(),
        event.metadata_uri.clone(),
    )?;

    // NFT Minting

    mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.ticket_mint.to_account_info(),
                to: ctx.accounts.buyer_ticket_ata.to_account_info(),
                authority: ctx.accounts.ticket.to_account_info(),
            },
            signer,
        ),
        1,
    )?;

    // Initialize Ticket Account
    let ticket = &mut ctx.accounts.ticket;
    ticket.id = event.tickets_sold;
    ticket.event = event_pubkey;
    ticket.mint = ctx.accounts.ticket_mint.key();
    ticket.valid_until = event.end_time;
    ticket.used = false;
    ticket.bump = ctx.bumps.ticket;

    // Update Event State
    event.tickets_sold = event
        .tickets_sold
        .checked_add(1)
        .ok_or(EventError::NumericOverflow)?;

    msg!("Ticket minted successfully: {}", ticket.id);

    Ok(())
}
