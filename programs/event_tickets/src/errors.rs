use anchor_lang::prelude::*;

/// Defines the custom errors that can be returned by the program.
#[error_code]
pub enum EventError {
    // Event creation errors
    #[msg("Event name must be at least 3 characters long.")]
    NameTooShort,
    #[msg("Event name cannot exceed 100 characters.")]
    NameTooLong,
    #[msg("Event symbol cannot exceed 10 characters.")]
    SymbolTooLong,
    #[msg("Event description cannot exceed 500 characters.")]
    DescriptionTooLong,
    #[msg("Metadata URI cannot exceed 200 characters.")]
    UriTooLong,
    #[msg("The event's end time must be after its start time.")]
    InvalidEventTime,
    #[msg("The total number of tickets must be greater than zero.")]
    InvalidTicketCount,
    #[msg("This event has already ended.")]
    EventEnded,
    #[msg("This action can only be performed after the event has ended.")]
    EventNotEnded,

    // Ticket minting errors
    #[msg("The ticket price must be greater than zero.")]
    InvalidTicketPrice,
    #[msg("The buyer does not have sufficient lamports to purchase the ticket.")]
    InsufficientFunds,
    #[msg("This event is sold out; no more tickets can be minted.")]
    EventSoldOut,
    #[msg("This ticket has already been marked as used.")]
    TicketAlreadyUsed,
    #[msg("This ticket has expired and is no longer valid.")]
    TicketExpired,
    #[msg("The signer is not the owner of this ticket.")]
    TicketHolderMismatch,

    // General Errors
    #[msg("A numeric operation resulted in an overflow.")]
    NumericOverflow,
    #[msg("The provided authority does not match the expected authority for this action.")]
    AuthorityMismatch,
    #[msg("The signer is not authorized to perform this action.")]
    Unauthorized,
}
