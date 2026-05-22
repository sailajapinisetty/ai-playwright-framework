# Manual Test Cases - Story 1 (UI input)

Story title: View Shopping Cart

## Story Acceptance Criteria
- User can navigate to the cart page
- Cart page displays all added items
- Cart is accessible from any page in the application
- Empty cart shows an appropriate message when no items have been added

## Manual Test Cases

### TEST_Story_1_TestCase_1 - Verify that a logged-in user with items in cart can view the cart page successfully
- Type: functional
- Priority: high
- Automation candidate: Yes
- Automation reason: The cart navigation and item display involve stable UI elements such as links, icons, and list components that can be reliably targeted and verified using Playwright selectors and assertions.
- Preconditions:
  - User has a valid account and is logged in
  - At least one product has been added to the cart
  - User is on the application home page
- Steps:
  1. 1. Open the application in a supported browser and ensure the user is logged in.
  2. 2. Observe the navigation bar or header area for a cart icon or 'Cart' link.
  3. 3. Click on the cart icon or 'Cart' link.
  4. 4. Verify that the browser navigates to the cart page (URL should contain '/cart' or equivalent).
  5. 5. Observe the cart page content and confirm that the previously added item(s) are listed.
  6. 6. Verify that each listed item displays at minimum the product name and quantity.
  7. 7. Verify that a cart summary or total section is visible on the page.
- Expected result: The cart page loads successfully, displays all previously added items with their details, and shows a cart summary. No errors or blank pages are shown.
- Acceptance criteria covered:
  - User can navigate to the cart page
  - Cart page displays all added items
  - Cart is accessible from any page in the application

## Selected For Automation
- TEST_Story_1_TestCase_1: Verify that a logged-in user with items in cart can view the cart page successfully
