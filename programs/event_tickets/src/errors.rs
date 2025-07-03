use anchor_lang::prelude::*;

/// Defines the custom errors that can be returned by the program.
#[error_code]
pub enum EventError {
    // Event creation errors
    #[msg("Event name must be at least 3 characters long.")]
    NameTooShort,
    #[msg("Event name cannot exceed 100 characters.")]
    NameTooLong,
    #[msg("Event description cannot exceed 500 characters.")]
    DescriptionTooLong,
    #[msg("The event's end time must be after its start time.")]
    InvalidEventTime,
    #[msg("The total number of tickets must be greater than zero.")]
    InvalidTicketCount,

    // Ticket minting errors
    #[msg("The ticket price must be greater than zero.")]
    InvalidTicketPrice,
    #[msg("The buyer does not have sufficient lamports to purchase the ticket.")]
    InsufficientFunds,
    #[msg("This event is sold out; no more tickets can be minted.")]
    EventSoldOut,

    // General Errors
    #[msg("A numeric operation resulted in an overflow.")]
    NumericOverflow,
}
