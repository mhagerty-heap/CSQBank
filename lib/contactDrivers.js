// Contact-driver taxonomy (demo conversational-intelligence data).
// L1 > L2 > L3, each L3 with a definition. Every L3 gets a slug (slugify(L3))
// that doubles as an assistant scenario slug — see lib/assistantScenarios.js.

const TAXONOMY = [
  ['Account Management', [
    ['Account Standing', [
      ['Account Closure', 'Users requesting to close their CSQBank checking or savings account or end their relationship with the bank'],
      ['Account Reopen Request', 'Users asking to reopen or reactivate a CSQBank account that was previously closed, either by the customer or by the bank'],
      ['Document Request', 'Users requesting statements, transaction history, tax forms, or account letters for their CSQBank accounts'],
    ]],
    ['Account Creation', [
      ['Account Creation Request', 'Users asking how to open a new CSQBank checking or savings account, including the High-Yield Savings Account, or what they need to sign up'],
      ['Account Creation Issue', 'Users reporting problems while opening a new CSQBank checking or savings account, such as a rejected sign-up form, a verification code that never arrives, a failed identity check, or an application stuck pending'],
    ]],
    ['Sign-in', [
      ['Account Access Issue', 'Users unable to log in to their existing CSQBank account for reasons other than a password reset, verification code, or biometric sign-in, such as rejected credentials or a lockout'],
      ['Password Reset', 'Users who forgot their CSQBank password or are having trouble resetting it'],
      ['Multi-Factor Authentication Issue', "Users having trouble with the verification step when signing in to their CSQBank account, such as codes that don't arrive or are rejected"],
      ['Biometric Login Issue', 'Users having trouble signing in to the CSQBank app with Face ID, Touch ID, or fingerprint, or asking how to turn it on or off'],
    ]],
    ['Account Information', [
      ['Update Profile Information', 'Users requesting to change personal details on their CSQBank profile, such as address, name, phone number, or email'],
      ['Balance Inquiry', 'Users asking about their checking or savings balance, including why it is lower than expected or negative, their account or routing number, or whether their account is active'],
      ['Transaction Inquiry', 'Users asking about a specific transaction in their CSQBank activity, such as what it is, which account it hit, or what its status label means, without disputing it'],
      ['Transaction History Request', 'Users asking for a list or export of their past CSQBank transactions, or how far back their activity goes'],
    ]],
    ['Cards', [
      ['Replacement Card Request', 'Users requesting a new or replacement CSQBank debit or credit card because the card is lost, stolen, damaged, or expiring'],
      ['Card Not Received', 'Users reporting that a new, replacement, or newly approved CSQBank card has not arrived, or asking for its delivery status'],
      ['Card Activation', 'Users asking how to activate a newly received CSQBank card, or reporting that activation is failing'],
      ['Card PIN Issue', 'Users asking to set, change, or reset their CSQBank card PIN, or reporting a PIN that is rejected or locked'],
      ['Card Lock', 'Users asking to lock, unlock, or freeze their CSQBank card, or asking why their card shows as locked or disabled'],
      ['Mobile Wallet Issue', 'Users needing help adding a CSQBank card to Apple Pay, Google Pay, or Samsung Pay, or reporting errors with a wallet'],
    ]],
  ]],
  ['Money Movement', [
    ['Deposits', [
      ['Direct Deposit Setup', 'Users asking how to set up or change direct deposit into their CSQBank account, including the routing and account numbers their employer needs'],
      ['Missing Direct Deposit', 'Users reporting that an expected paycheck, government benefit, or tax refund direct deposit has not arrived, is late, or is only partial'],
      ['Mobile Check Deposit Issue', 'Users reporting problems depositing a check with CSQBank mobile check deposit, or asking when deposited funds will be available'],
    ]],
    ['Transfers and Payments', [
      ['Money Transfer Issue', 'Users needing help with transfers between their CSQBank checking and savings, or with ACH and wire transfers to or from an external bank'],
      ['Pay a Friend Issue', 'Users reporting problems sending or receiving money with CSQBank Pay a Friend, including adding friends, scheduled payments, and payments sent to the wrong person'],
      ['Bill Pay Issue', 'Users reporting problems paying bills through CSQBank Bill Pay, including adding payees, scheduling payments, and billers not receiving payment'],
    ]],
    ['Transaction Activity', [
      ['Pending Charge Settlement Timing', 'Users asking when a pending charge or pre-authorization hold will clear, settle, or drop off their account'],
      ['Declined Transaction', 'Users asking why a card purchase, ATM withdrawal, or other transaction was declined, or reporting that their card is not accepted at a merchant'],
    ]],
    ['Disputes and Refunds', [
      ['Transaction Dispute', 'Users disputing a transaction they recognize but believe is wrong, such as a duplicate charge, a wrong amount, or a merchant refund that never arrived, or following up on an existing dispute'],
      ['Cancel Transaction', 'Users asking to cancel, stop, or reverse a one-off card transaction or a transfer between their accounts'],
    ]],
  ]],
  ['Fraud and Security', [
    ['Account Security', [
      ['Account Compromise', 'Users reporting a security incident such as a hacked account, a stolen phone, identity theft, or an unrecognized sign-in, and asking to secure their account'],
      ['Account Frozen by Bank', 'Users reporting that CSQBank has frozen, restricted, or placed their account under review, and asking why or how to lift it'],
    ]],
    ['Transaction Fraud', [
      ['Suspicious Transaction', 'Users asking about a transaction or activity that CSQBank flagged as suspicious, or that looks suspicious to them, to confirm it, release it, or understand why it was flagged'],
      ['Unauthorized Transaction', 'Users reporting a charge, payment, or transfer they did not make or authorize, or following up on a fraud claim'],
    ]],
  ]],
  ['Charges and Fees', [
    ['Recurring and Fees', [
      ['Recurring Charge Cancellation', 'Users wanting to stop or block a recurring or subscription charge, or block a merchant from charging their card again'],
      ['Fee Refund Request', 'Users asking why a CSQBank fee was charged or requesting a refund, such as an ATM or foreign transaction fee'],
      ['Transaction Limit', 'Users asking about or requesting changes to their card spending, ATM, transfer, Pay a Friend, Bill Pay, or mobile deposit limits'],
    ]],
  ]],
  ['Lending and Credit', [
    ['Personal and Auto Loans', [
      ['Loan Eligibility Inquiry', 'Users asking about CSQBank personal or auto loan rates, terms, and eligibility before applying'],
      ['Loan Application Issue', 'Users having trouble completing the CSQBank online loan application before submitting it, or wanting to resume, edit, or delete a draft'],
      ['Loan Application Status', 'Users following up on a submitted CSQBank loan application that is still in underwriting, including requested documents and timing'],
      ['Loan Decision', 'Users asking about the decision on their CSQBank loan application, including approvals, counter-offers, denials, and the reasons behind them'],
      ['Loan Disbursement', 'Users with an approved CSQBank loan asking when and where the funds will be sent, or reporting that funds have not arrived'],
      ['Loan Repayment', "Users with an active CSQBank loan asking about payments, due dates, autopay, payoff, late payments, or relief when they can't pay"],
    ]],
    ['Credit Card', [
      ['Credit Card Offer Inquiry', "Users asking about the pre-approved CSQBank rewards card offer or the card's terms and rewards before applying"],
      ['Credit Card Application Status', 'Users asking about their CSQBank credit card application, including problems completing it, when they will hear back, and the decision'],
      ['Credit Card Account Question', 'Users who hold the CSQBank credit card asking about payments, statement balance, interest, credit limit, rewards, fees, or closing the card'],
    ]],
    ['Credit Reporting', [
      ['Credit Report Inquiry', 'Users concerned about how a CSQBank application, loan, or credit card affects their credit report or score, including hard and soft credit checks'],
    ]],
  ]],
  ['Products and Features', [
    ['Banking Products', [
      ['Savings Interest Inquiry', 'Users asking about the interest earned on their CSQBank savings or High-Yield Savings Account, including the APY, how interest is calculated, and when it is paid'],
      ['Product Availability Inquiry', 'Users asking whether CSQBank offers a product, feature, or service, or whether they are eligible for one, before using it'],
      ['Product Pricing Inquiry', 'Users asking what a CSQBank account or service costs, such as monthly fees, minimum balances, or the price of a wire transfer or card replacement'],
    ]],
    ['Digital Features', [
      ['Account Alerts', "Users asking how to set up or manage CSQBank real-time alerts, or reporting alerts that don't arrive"],
      ['Spending Insights', 'Users asking about CSQBank spending insights, including how transactions are categorized and where to see monthly trends'],
    ]],
  ]],
  ['Promotions', [
    ['Promotions', [
      ['Promotion Inquiry', 'Users asking about CSQBank promotions before a reward is due, especially the High-Yield Savings offer ($300 bonus with a qualifying direct deposit and 4.50% APY)'],
      ['Bonus Not Received', 'Users reporting that a promised CSQBank bonus, such as the $300 High-Yield Savings bonus, has not been paid or was paid incorrectly'],
    ]],
  ]],
  ['Service and Support', [
    ['Service Issues', [
      ['App Technical Issue', "Users reporting app crashes, error messages, or pages that won't load that stop them from using CSQBank online banking"],
    ]],
    ['Appointments', [
      ['Meeting Request', 'Users asking to book a new meeting or callback with a CSQBank representative about checking, savings, or loan products'],
      ['Meeting Reschedule', 'Users asking to move or cancel a meeting or callback they already booked with a CSQBank representative'],
      ['Meeting Status', 'Users asking for an update on a meeting or callback they already requested, such as whether it is confirmed, when it will happen, or why no one has been in touch'],
    ]],
  ]],
];

function slugify(s) {
  return String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Flat list: [{ l1, l2, l3, definition, slug }]
const DRIVERS = [];
TAXONOMY.forEach(([l1, l2s]) => {
  l2s.forEach(([l2, l3s]) => {
    l3s.forEach(([l3, definition]) => {
      DRIVERS.push({ l1, l2, l3, definition, slug: slugify(l3) });
    });
  });
});

module.exports = { DRIVERS, slugify };
