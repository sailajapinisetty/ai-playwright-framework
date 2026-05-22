# Manual Test Cases - CLI input

Story title: Search and Add Arc Mechanical Keyboard to Cart

## Story Acceptance Criteria
- User can search for a product using the search functionality
- Search results display the product 'Arc Mechanical Keyboard' when searched
- User can select the 'Arc Mechanical Keyboard' product from search results
- User can successfully add the 'Arc Mechanical Keyboard' to the shopping cart
- Cart reflects the added product with correct name and quantity

## Manual Test Cases

### TC-001 - Search for Arc Mechanical Keyboard and Add to Cart Successfully
- Type: functional
- Priority: high
- Automation candidate: Yes
- Automation reason: This is a stable, repeatable happy-path flow with predictable UI elements such as search input, search button, product listing, Add to Cart button, and cart summary. All interactions and assertions can be reliably scripted in Playwright using selectors, text matching, and URL navigation checks. It is a high-priority regression candidate.
- Preconditions:
  - User has a valid account and is logged in, or the store allows guest browsing
  - The product 'Arc Mechanical Keyboard' exists and is in stock in the system
  - User is on the homepage or any page with access to the search bar
  - Shopping cart is empty before starting the test
- Steps:
  1. Navigate to the application homepage in a supported browser
  2. Locate the search bar at the top of the page
  3. Click on the search bar to activate it
  4. Type 'Arc Mechanical Keyboard' into the search input field
  5. Press the Enter key or click the Search/magnifying glass button to submit the search
  6. Observe the search results page that loads
  7. Verify that the product 'Arc Mechanical Keyboard' appears in the search results list
  8. Click on the product titled 'Arc Mechanical Keyboard' to open the product detail page
  9. Verify the product detail page displays the correct product name 'Arc Mechanical Keyboard'
  10. Click the 'Add to Cart' button on the product detail page
  11. Observe the confirmation message or cart icon update after clicking 'Add to Cart'
  12. Navigate to the shopping cart by clicking the cart icon or 'View Cart' link
  13. Verify that 'Arc Mechanical Keyboard' is listed in the cart with a quantity of 1
- Expected result: The product 'Arc Mechanical Keyboard' is successfully found via search, the product detail page loads correctly, and after clicking 'Add to Cart' the item appears in the shopping cart with the correct product name and a quantity of 1. A success confirmation is displayed to the user upon adding the item.
- Acceptance criteria covered:
  - User can search for a product using the search functionality
  - Search results display the product 'Arc Mechanical Keyboard' when searched
  - User can select the 'Arc Mechanical Keyboard' product from search results
  - User can successfully add the 'Arc Mechanical Keyboard' to the shopping cart
  - Cart reflects the added product with correct name and quantity

## Selected For Automation
- TC-001: Search for Arc Mechanical Keyboard and Add to Cart Successfully
