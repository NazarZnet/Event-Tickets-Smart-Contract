use anchor_lang::prelude::*;

/// The length of the discriminator for an Anchor account.
pub const DISCRIMINATOR_LENGHT: usize = 8;

/// Seed for the event counter PDA.
#[constant]
pub const EVENT_COUNTER_SEED: &[u8] = b"event_counter";

/// Seed for the main event PDA.
#[constant]
pub const EVENT_SEED: &[u8] = b"event";

/// Seed for the event's vault PDA.
#[constant]
pub const VAULT_SEED: &[u8] = b"vault";

/// Seed for the ticket PDA.
#[constant]
pub const TICKET_SEED: &[u8] = b"ticket";

/// Seed for the ticket mint PDA.
#[constant]
pub const TICKET_MINT_SEED: &[u8] = b"ticket_mint";

#[constant]
pub const TICKET_OWNERSHIP_SEED: &[u8] = b"ticket_ownership";
