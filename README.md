# Crowdfund

## Disclaimer

⚠️⚠️ This contract is not audited. Using it on production is strongly advised against. ⚠️⚠️

## Description

This is a structured crowdfunding contract with the following requirements:

- The project owner initializes the contract, and is the sole address with withdrawal privileges.
- The fundraising goal should be set at the time of contract initialization (via the factory contract).
- The project owner is only allowed to withdraw the funds when the project is successful (i.e fundraising goals achieved).
- The project owner is allowed to cancel the project as long as it wasn't already successful.
- The contributors are allowed to contribute as long as the project is active (i.e neither cancelled nor successful).
- The project will expire - and therefore fail - if the target is not achieved within 30 days. This is a configurable constant.
- Once a project fails (either through cancellation or expiry), project contributors are entitled to refunds.
- Project contributors are not entitled to a refund on an ongoing or a successful project.
- Project contributors are entitled to one contribution badge NFT, per each 1 ETH they contribute.

## Technical Details

- This project uses the factory pattern. ProjectFactory.sol contract is deployed once. Project owners who want to deploy their own crowdfunding projects can use the `create()` function on the `ProjectFactory.sol` contract.
- The core project logic lives inside the `Project.sol` contract.
- This project has an extensive unit test suite, located under `./test/crowdfundr.test.ts`. You will see a total of 54 passing tests.

## Instructions

- Run `npm install` to install all dependencies.
- Run `npx hardhat test` to run the test suite.