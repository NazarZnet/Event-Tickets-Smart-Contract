use anchor_lang::prelude::*;
#[error_code]
pub enum EventError {
    #[msg("Event name is too short")]
    NameTooShort,
    #[msg("Event name is too long. Max length is 100 characters")]
    NameTooLong,
    #[msg("Event description is too long. Max length is 500 characters")]
    DescriptionTooLong,

    #[msg("Event end time must be after start time")]
    InvalidEventTime,
    #[msg("Total tickets must be greater than zero")]
    InvalidTicketCount,
    #[msg("Ticket price must be greater than zero")]
    InvalidTicketPrice,

    #[msg("Insufficient funds to buy ticket")]
    InsufficientFunds,
}
