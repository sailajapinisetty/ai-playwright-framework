# Manual Test Cases - CLI input

Story title: View Shopping Cart

## Story Acceptance Criteria
- User can navigate to the cart page
- User can see all items added to the cart
- User can see item details such as name, quantity, and price in the cart
- User can see the total price of items in the cart
- User is informed when the cart is empty

## Manual Test Cases

### TC-001 - View cart with items successfully added
- Type: functional
- Priority: high
- Automation candidate: Yes
- Automation reason: This is a stable happy-path UI flow with clearly verifiable DOM elements such as item names, prices, quantities, and totals that Playwright can reliably locate, assert, and validate across browsers.
- Preconditions:
  - User is logged in or browsing as a guest
  - At least one item has been added to the cart
  - User is on the homepage or any product page
- Steps:
  1. 1. Locate the cart icon or 'View Cart' link in the navigation header
  2. 2. Click on the cart icon or 'View Cart' link
  3. 3. Observe the cart page or cart drawer that opens
  4. 4. Verify that all previously added items are displayed
  5. 5. Verify each item shows the product name
  6. 6. Verify each item shows the quantity
  7. 7. Verify each item shows the unit price
  8. 8. Verify a subtotal or total price is displayed at the bottom of the cart
- Expected result: The cart page displays all added items with their correct names, quantities, and prices, and the total cost is accurately calculated and visible to the user.
- Acceptance criteria covered:
  - User can navigate to the cart page
  - User can see all items added to the cart
  - User can see item details such as name, quantity, and price in the cart
  - User can see the total price of items in the cart

## Selected For Automation
- TC-001: View cart with items successfully added
