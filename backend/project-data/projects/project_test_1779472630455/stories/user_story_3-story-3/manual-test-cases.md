# Manual Test Cases - Story 3 (UI input)

Story title: Buy a Phone

## Story Acceptance Criteria
- User can browse available phones in the store
- User can select a phone to purchase
- User can add the selected phone to a cart
- User can complete the purchase of the phone
- User receives confirmation after successful purchase

## Manual Test Cases

### TC-001 - Successfully purchase a phone from end to end
- Type: functional
- Priority: high
- Automation candidate: Yes
- Automation reason: This is a stable end-to-end happy path flow with deterministic UI interactions including navigation, button clicks, form inputs, and verifiable confirmation messages that are well-suited for Playwright automation.
- Preconditions:
  - User has a valid registered account
  - User is logged in
  - At least one phone product is available in the store
  - User has a valid payment method saved or available to enter
  - Shopping cart is empty before starting
- Steps:
  1. 1. Navigate to the store homepage
  2. 2. Click on the 'Phones' or relevant product category section
  3. 3. Verify a list of available phones is displayed
  4. 4. Click on a phone product to open its detail page
  5. 5. Verify the phone name, price, and description are displayed
  6. 6. Click the 'Add to Cart' or 'Buy Now' button
  7. 7. Verify the phone is added to the cart and cart item count updates
  8. 8. Navigate to the shopping cart
  9. 9. Verify the selected phone appears in the cart with correct name, quantity, and price
  10. 10. Click 'Proceed to Checkout'
  11. 11. Verify the order summary shows the correct phone and total price
  12. 12. Enter or confirm shipping address details
  13. 13. Enter or select a valid payment method
  14. 14. Click 'Place Order' or 'Confirm Purchase'
  15. 15. Verify a confirmation page or message is displayed with an order number
  16. 16. Verify a confirmation email is received at the registered email address
- Expected result: The phone is successfully purchased, an order confirmation page displays a unique order number, and a confirmation email is sent to the user's registered email address.
- Acceptance criteria covered:
  - User can browse available phones in the store
  - User can select a phone to purchase
  - User can add the selected phone to a cart
  - User can complete the purchase of the phone
  - User receives confirmation after successful purchase

## Selected For Automation
- TC-001: Successfully purchase a phone from end to end
