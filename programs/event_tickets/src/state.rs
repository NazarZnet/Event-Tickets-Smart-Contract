use anchor_lang::prelude::*;

/// The main account representing a single event.
///
/// This account holds all the critical information about an event, such as its name,
/// timing, price, and ticket sales data. It is the central piece of the application.
#[account]
#[derive(InitSpace)]
pub struct Event {
    /// The unique, sequential ID of the event, used as a seed.
    pub id: u64,
    /// The public key of the administrator who created and manages the event.
    pub admin: Pubkey,
    /// The public key of the Program-Derived Address (PDA) that holds the funds from ticket sales.
    pub vault: Pubkey,
    /// The name of the event.
    #[max_len(100)]
    pub name: String,
    /// A detailed description of the event.
    #[max_len(500)]
    pub description: String,
    /// The URI for the NFT metadata, pointing to a JSON file.
    #[max_len(200)]
    pub metadata_uri: String,
    /// The Unix timestamp when the event starts.
    pub start_time: i64,
    /// The Unix timestamp when the event ends.
    pub end_time: i64,
    /// The price of a single ticket in lamports.
    pub ticket_price: u64,
    /// The total number of tickets available for this event.
    pub total_tickets: u64,
    /// The number of tickets that have been sold so far.
    pub tickets_sold: u64,
    /// The number of tickets that have been returned by buyers.
    pub tickets_returned: u64,
    /// The bump seed for the event PDA.
    pub bump: u8,
}

/// A counter for all events created by a specific admin.
///
/// This account ensures that each event created by an admin has a unique, sequential ID.
#[account]
#[derive(InitSpace)]
pub struct EventCounter {
    /// The public key of the administrator.
    pub admin: Pubkey,
    /// The ID for the next event to be created.
    pub next_event_id: u64,
}

/// Represents a single ticket NFT.
///
/// This account stores the metadata for a ticket, linking it to an event, its owner,
/// and the corresponding SPL token mint.
#[account]
#[derive(InitSpace)]
pub struct Ticket {
    /// The unique, sequential ID of the ticket within its event, used as a seed.
    pub id: u64,
    /// The public key of the `Event` this ticket belongs to.
    pub event: Pubkey,
    /// The public key of the SPL token mint that represents this ticket as an NFT.
    pub mint: Pubkey,
    /// A Unix timestamp indicating when the ticket is no longer valid (e.g., after the event ends).
    pub valid_until: i64,
    /// A flag to indicate whether the ticket has been used or redeemed.
    pub used: bool,
    /// The bump seed for the ticket PDA.
    pub bump: u8,
}

/// A PDA account that holds the funds for an event.
#[account]
pub struct EventVault {}
