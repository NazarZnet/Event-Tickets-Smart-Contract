use anchor_lang::prelude::*;

use anchor_spl::token_2022::{
    spl_token_2022::{
        extension::{
            transfer_hook::TransferHookAccount, BaseStateWithExtensions, StateWithExtensions,
        },
        state::Account as Token2022Account,
    },
    ID as TOKEN_2022_PROGRAM_ID,
};

use anchor_spl::token_interface::{Mint, TokenAccount};

use spl_transfer_hook_interface::error::TransferHookError;

use crate::constants::{EXTRA_ACCOUNTS_METAS_SEED, TICKET_OWNERSHIP_SEED};
use crate::state::TicketOwnership;

#[derive(Accounts)]
pub struct TransferHook<'info> {
    #[account(token::mint = mint, token::authority = owner, token::token_program=TOKEN_2022_PROGRAM_ID)]
    pub source_token: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mint::token_program = TOKEN_2022_PROGRAM_ID,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(token::mint = mint, token::token_program=TOKEN_2022_PROGRAM_ID)]
    pub destination_token: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: source token account owner, can be SystemAccount or PDA owned by another program
    pub owner: UncheckedAccount<'info>,

    /// CHECK: ExtraAccountMetaList Account,
    #[account(seeds = [EXTRA_ACCOUNTS_METAS_SEED, mint.key().as_ref()], bump)]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [TICKET_OWNERSHIP_SEED, mint.key().as_ref()],
        bump
    )]
    pub ticket_ownership: Account<'info, TicketOwnership>,
}

/// Handler for the transfer hook instruction.
/// This function is called when a transfer hook is triggered.
pub fn transfer_hook_handler(ctx: Context<TransferHook>, _amount: u64) -> Result<()> {
    // Fail this instruction if it is not called from within a transfer hook
    let source_account = &ctx.accounts.source_token;
    let destination_account = &ctx.accounts.destination_token;

    check_token_account_is_transferring(&source_account.to_account_info().try_borrow_data()?)?;
    check_token_account_is_transferring(&destination_account.to_account_info().try_borrow_data()?)?;

    ctx.accounts.ticket_ownership.owner = ctx.accounts.destination_token.owner;

    msg!(
        "Ticket owner updated to: {}",
        ctx.accounts.ticket_ownership.owner
    );

    Ok(())
}

/// Checks if the token account is currently transferring.
fn check_token_account_is_transferring(account_data: &[u8]) -> Result<()> {
    let token_account = StateWithExtensions::<Token2022Account>::unpack(account_data)?;
    let extension = token_account.get_extension::<TransferHookAccount>()?;
    if bool::from(extension.transferring) {
        Ok(())
    } else {
        Err(Into::<ProgramError>::into(
            TransferHookError::ProgramCalledOutsideOfTransfer,
        ))?
    }
}
