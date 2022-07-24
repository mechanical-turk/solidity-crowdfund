// ----------------------------------------------------------------------------
// REQUIRED: Instructions
// ----------------------------------------------------------------------------
/*
  For this first project, we've provided a significant amount of scaffolding
  in your test suite. We've done this to:

    1. Set expectations, by example, of where the bar for testing is.
    2. Encourage more students to embrace an Advanced Typescript Hardhat setup.
    3. Reduce the amount of time consumed this week by "getting started friction".

  Please note that:

    - We will not be so generous on future projects!
    - The tests provided are about ~90% complete.
    - IMPORTANT:
      - We've intentionally left out some tests that would reveal potential
        vulnerabilities you'll need to identify, solve for, AND TEST FOR!

      - Failing to address these vulnerabilities will leave your contracts
        exposed to hacks, and will certainly result in extra points being
        added to your micro-audit report! (Extra points are _bad_.)

  Your job (in this file):

    - DO NOT delete or change the test names for the tests provided
    - DO complete the testing logic inside each tests' callback function
    - DO add additional tests to test how you're securing your smart contracts
         against potential vulnerabilties you identify as you work through the
         project.

    - You will also find several places where "FILL_ME_IN" has been left for
      you. In those places, delete the "FILL_ME_IN" text, and replace with
      whatever is appropriate.
*/
// ----------------------------------------------------------------------------

import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";

import {
  FIFTY_ETHERS,
  FIVE_ETHERS,
  Helper,
  HUNDRED_ETHERS,
  ONE_ETHER,
  ProjectStatus,
  SECONDS_IN_DAY,
  SECONDS_IN_LITTLE_OVER_30_DAYS,
  series,
  timeTravel,
  TWENTY_FIVE_ETHERS,
} from "./helper";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Project } from "../typechain";

describe("Crowdfundr", () => {
  let helper: Helper;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;
  let dan: SignerWithAddress;

  beforeEach(async () => {
    helper = await Helper.init();
    const { signers } = helper;
    alice = signers.alice;
    bob = signers.bob;
    charlie = signers.charlie;
    dan = signers.dan;
  });

  describe("ProjectFactory: Additional Tests", () => {
    const A_HUNDREDTH_OF_ONE_ETHER = ONE_ETHER.div(100);
    /* 
      NOTE: If you wind up writing Solidity code to protect against a
            vulnerability that is not tested for below, you should add
            at least one test here.

      DO NOT: Delete or change the test names for the tests provided below
    */

    it("Can't create project if goal is less than 0.01 ETH", async () => {
      await expect(
        helper.projectFactory
          .connect(alice)
          .create(A_HUNDREDTH_OF_ONE_ETHER.sub(1), "My Project", "MPT")
      ).to.revertedWith("Goal is less than minimum contribution.");
    });

    it("Can create project if goal is exactly 0.01 ETH", async () => {
      const project = await helper.createFreshProject({
        owner: alice,
        goal: A_HUNDREDTH_OF_ONE_ETHER,
      });
      const owner = await project.owner();
      expect(owner).to.equal(alice.address);
    });

    it("Can create project if goal is above 0.01 ETH", async () => {
      const project = await helper.createFreshProject({
        owner: alice,
        goal: A_HUNDREDTH_OF_ONE_ETHER.add(1),
      });
      const owner = await project.owner();
      expect(owner).to.equal(alice.address);
    });
  });

  describe("ProjectFactory", () => {
    it("Deploys a contract", () => {
      const { projectFactory } = helper;
      expect(projectFactory.address).to.be.a("string");
    });

    it("Can register a single project", async () => {
      const project = await helper.createFreshProject({
        owner: alice,
        goal: ONE_ETHER,
      });
      expect(project.address).to.be.a("string");
      const projectFields = await helper.getProjectFields(project);
      expect(projectFields.goal).to.equal(ONE_ETHER);
    });

    it("Can register multiple projects", async () => {
      const goals = [
        ONE_ETHER,
        ONE_ETHER.mul(2),
        ONE_ETHER.mul(3),
        ONE_ETHER.mul(4),
      ];
      const owners = [alice, alice, bob, charlie];
      const thunks = goals.map(
        (goal, index) => () =>
          helper.createFreshProject({
            owner: owners[index],
            goal,
          })
      );
      const projects = await series(thunks);

      for (let i = 0; i < projects.length; i++) {
        const project = projects[i];
        expect(project.address).to.be.a("string");
        const fields = await helper.getProjectFields(project);
        expect(fields.goal).to.equal(goals[i]);
      }
    });

    it("Registers projects with the correct owner", async () => {
      const owners = [alice, bob, charlie, alice, bob, charlie];
      const projectThunks = owners.map(
        (owner) => () =>
          helper.createFreshProject({
            owner,
            goal: ONE_ETHER,
          })
      );
      const projects = await series(projectThunks);

      for (let i = 0; i < projects.length; i++) {
        const project = projects[i];
        const expectedOwner = owners[i].address;
        const actualOwner = await project.owner();
        expect(actualOwner).to.equal(expectedOwner);
      }
    });

    it("Registers projects with a preset funding goal (in units of ether)", async () => {
      const owners = [alice, bob, charlie];
      const goals = [ONE_ETHER, ONE_ETHER.mul(2), ONE_ETHER.mul(3)];
      const thunks = owners.map(
        (owner, index) => () =>
          helper.createFreshProject({
            owner,
            goal: goals[index],
          })
      );
      const projects = await series(thunks);

      for (let i = 0; i < projects.length; i++) {
        const project = projects[i];
        const expectedGoal = goals[i];
        const fields = await helper.getProjectFields(project);
        expect(fields.goal).to.equal(expectedGoal);
      }
    });

    it('Emits a "ProjectCreated" event after registering a project', async () => {
      const { projectFactory } = helper;

      // First project by Alice
      const trx = await projectFactory
        .connect(alice)
        .create(ONE_ETHER, "My Project", "MPT");
      const projectCreatedEvent = await helper.getSingletonEvent(trx);
      const { args } = projectCreatedEvent;
      if (!args) {
        throw new Error("Expected non-empty args array");
      }
      const project = await helper.getProjectAtAddress(args[0]);
      expect(projectCreatedEvent.event).to.equal("ProjectCreated");
      expect(args[0]).to.equal(project.address);
      expect(args[1]).to.equal(alice.address);
      expect(args[2]).to.equal(ONE_ETHER);
    });

    it("Allows multiple contracts to accept ETH simultaneously", async () => {
      const projects = await series([
        () => helper.createFreshProject({ owner: alice, goal: HUNDRED_ETHERS }),
        () => helper.createFreshProject({ owner: bob, goal: HUNDRED_ETHERS }),
        () =>
          helper.createFreshProject({ owner: charlie, goal: HUNDRED_ETHERS }),
      ]);
      for (const project of projects) {
        const balanceBefore = await ethers.provider.getBalance(project.address);

        // Before any trx, the balance within the contract should equal 0.
        expect(balanceBefore).to.equal(0);

        await project.connect(bob).contribute({
          value: ONE_ETHER,
        });
        await project.connect(alice).contribute({
          value: ONE_ETHER.mul(2),
        });
        await project.connect(charlie).contribute({
          value: ONE_ETHER.mul(3),
        });

        const balanceAfter = await ethers.provider.getBalance(project.address);
        // After the trxs, the balance within the contract should equal 1 + 2 + 3 = 6 ETH.
        expect(balanceAfter).to.equal(ethers.utils.parseEther("6"));
      }
    });
  });

  describe("Project: Additional Tests", () => {
    /* 

      NOTE: If you wind up protecting against a vulnerability that is not
            tested for below, you should add at least one test here.

      DO NOT: Delete or change the test names for the tests provided below
    */

    it("Accepts contributions above 0.01 ETH", async () => {
      const A_HUNDREDTH_OF_ONE_ETHER = ONE_ETHER.div(100);
      const contributions = [
        A_HUNDREDTH_OF_ONE_ETHER,
        A_HUNDREDTH_OF_ONE_ETHER.add(1),
        A_HUNDREDTH_OF_ONE_ETHER.add(2),
        A_HUNDREDTH_OF_ONE_ETHER.add(3),
        ONE_ETHER,
        FIVE_ETHERS,
        FIFTY_ETHERS,
      ];
      const project = await helper.createFreshProject({
        owner: alice,
        goal: HUNDRED_ETHERS,
      });
      for (const contribution of contributions) {
        const balanceBefore = await ethers.provider.getBalance(project.address);
        await project.connect(bob).contribute({
          value: contribution,
        });
        const balanceAfter = await ethers.provider.getBalance(project.address);
        const diff = balanceAfter.sub(balanceBefore);
        expect(diff).to.equal(contribution);
      }
    });

    it("Blocks contributions via regular transactions (i.e without using the contribute() method)", async () => {
      const project = await helper.createFreshProject({
        owner: alice,
        goal: HUNDRED_ETHERS,
      });
      await expect(
        alice.sendTransaction({
          to: project.address,
          value: ONE_ETHER,
        })
      ).to.be.reverted;
    });

    it("Blocks refunds from a failed project if msg.sender is not a contributor", async () => {
      const project = await helper.createPartiallyFundedCancelledProject({
        owner: alice,
        goal: HUNDRED_ETHERS,
        totalContribution: FIFTY_ETHERS,
        contributors: [bob, charlie],
      });
      await expect(project.connect(dan).refund()).to.revertedWith(
        "Insufficient contribution"
      );
    });

    it("Does not allow the project owner to cancel a successfully funded project", async () => {
      const project = await helper.createSuccessfulProject({
        owner: alice,
        goal: HUNDRED_ETHERS,
      });
      await expect(project.connect(alice).cancel()).to.revertedWith(
        "Active only"
      );
    });

    it("Does not allow the project owner to cancel an expired project", async () => {
      const project = await helper.createExpiredProject({
        owner: alice,
        goal: HUNDRED_ETHERS,
      });
      await expect(project.connect(alice).cancel()).to.revertedWith(
        "Active only"
      );
    });

    it("Does not allow the project owner to cancel an already cancelled project", async () => {
      const project = await helper.createCancelledProject({
        owner: alice,
        goal: HUNDRED_ETHERS,
      });
      await expect(project.connect(alice).cancel()).to.revertedWith(
        "Active only"
      );
    });

    it("Emits an ERC721 transfer() event upon claiming an NFT badge", async () => {
      const project = await helper.createSuccessfulProject({
        owner: alice,
        goal: HUNDRED_ETHERS,
        contributors: [bob, charlie],
      });
      const contributors = [bob, charlie];

      for (let i = 0; i < contributors.length; i++) {
        const contributor = contributors[i];
        const trx = await project.connect(contributor).claimBadge();
        const transferEvent = await helper.getSingletonEvent(trx);
        const { args } = transferEvent;
        if (!args) {
          throw new Error("Expected non-empty args array");
        }
        expect(args[0]).to.equal("0x0000000000000000000000000000000000000000");
        expect(args[1]).to.equal(contributor.address);
        expect(args[2]).to.equal(`${i + 1}`);
      }
    });

    it("Surfaces given name and symbol properties from the ERC721 base contract", async () => {
      const trx = await helper.projectFactory.create(
        HUNDRED_ETHERS,
        "FIRST_TOKEN",
        "FTT"
      );
      const project = await helper.getProjectCreatedFromTRX(trx);
      const { name, symbol } = await helper.getProjectFields(project);
      expect(name).to.equal("FIRST_TOKEN");
      expect(symbol).to.eq("FTT");
    });
  });

  describe("Project", () => {
    describe("Contributions", () => {
      let project: Project;

      beforeEach(async () => {
        project = await helper.createFreshProject({
          owner: alice,
          goal: HUNDRED_ETHERS,
        });
      });

      describe("Contributors", () => {
        it("Allows the creator to contribute", async () => {
          await project.connect(alice).contribute({
            value: ONE_ETHER,
          });
          const balance = await ethers.provider.getBalance(project.address);
          expect(balance).to.equal(ONE_ETHER);
        });

        it("Allows any EOA to contribute", async () => {
          await project.connect(bob).contribute({
            value: ONE_ETHER,
          });
          await project.connect(charlie).contribute({
            value: ONE_ETHER,
          });
          const balance = await ethers.provider.getBalance(project.address);
          expect(balance).to.equal(ONE_ETHER.mul(2)); // 1 + 1 = 2
        });

        it("Allows an EOA to make many separate contributions", async () => {
          await project.connect(bob).contribute({
            value: ONE_ETHER,
          });
          await project.connect(bob).contribute({
            value: ONE_ETHER.mul(2),
          });
          await project.connect(bob).contribute({
            value: ONE_ETHER.mul(3),
          });
          const balance = await ethers.provider.getBalance(project.address);
          expect(balance).to.equal(ONE_ETHER.mul(6)); // bob contributes 1 + 2 + 3 = 6 ETH.
        });

        it('Emits a "Contribution" event after a contribution is made', async () => {
          const trx = await project.connect(bob).contribute({
            value: ONE_ETHER,
          });
          const contributionEvent = await helper.getSingletonEvent(trx);
          const { args } = contributionEvent;
          if (!args) {
            throw new Error("Expected non-empty args array");
          }
          expect(contributionEvent.event).to.equal("Contribution");
          expect(args[0]).to.equal(bob.address);
          expect(args[1]).to.equal(ONE_ETHER);
        });
      });

      describe("Minimum ETH Per Contribution", () => {
        it("Reverts contributions below 0.01 ETH", async () => {
          await expect(
            project.connect(alice).contribute({
              value: ethers.utils.parseEther("0.009999999999999"),
            })
          ).to.be.revertedWith("Below minimum");
        });

        it("Accepts contributions of exactly 0.01 ETH", async () => {
          await project.connect(alice).contribute({
            value: ethers.utils.parseEther("0.01"),
          });
          const balance = await ethers.provider.getBalance(project.address);
          expect(balance).to.equal(ethers.utils.parseEther("0.01"));
        });
      });

      describe("Final Contributions", () => {
        it("Allows the final contribution to exceed the project funding goal", async () => {
          await project.connect(bob).contribute({
            value: ONE_ETHER,
          });
          await project.connect(bob).contribute({
            value: ONE_ETHER,
          });
          await project.connect(bob).contribute({
            value: ONE_ETHER,
          });
          await project.connect(bob).contribute({
            value: ONE_ETHER.mul(1000),
            // this one is way over the limit, but total funding until here is 3 eth, whereas the target is 4 eth.
            // so it should be allowed.
          });
          const balance = await ethers.provider.getBalance(project.address);
          expect(balance).to.equal(ONE_ETHER.mul(1003));
        });

        it("Prevents additional contributions after a project is fully funded", async () => {
          await project.connect(bob).contribute({
            value: HUNDRED_ETHERS,
          });
          await expect(
            project.connect(bob).contribute({
              value: ONE_ETHER,
            })
          ).to.revertedWith("Active only");
        });

        it("Prevents additional contributions after 30 days have passed since Project instance deployment", async () => {
          await timeTravel(SECONDS_IN_LITTLE_OVER_30_DAYS);
          await expect(
            project.connect(bob).contribute({
              value: ONE_ETHER,
            })
          ).to.revertedWith("Active only");
        });
      });
    });

    describe("Withdrawals", () => {
      describe("Project Status: Active", () => {
        let freshProject: Project;
        let partiallyFundedProject: Project;

        beforeEach(async () => {
          [freshProject, partiallyFundedProject] = await series([
            () =>
              helper.createFreshProject({
                owner: alice,
                goal: HUNDRED_ETHERS,
              }),
            () =>
              helper.createPartiallyFundedActiveProject({
                owner: alice,
                goal: HUNDRED_ETHERS,
                contributors: [bob, charlie],
                totalContribution: FIFTY_ETHERS,
              }),
          ]);
        });

        it("Prevents the creator from withdrawing any funds", async () => {
          for (const project of [freshProject, partiallyFundedProject]) {
            await project.connect(alice).contribute({
              value: ONE_ETHER,
            });
            await expect(
              project.connect(alice).withdraw(ONE_ETHER)
            ).to.revertedWith("Successful only");
          }
        });

        it("Prevents contributors from withdrawing any funds", async () => {
          for (const contributor of [bob, charlie]) {
            await expect(
              partiallyFundedProject.connect(contributor).withdraw(ONE_ETHER)
            ).to.revertedWith("Owner only");
          }
        });

        it("Prevents non-contributors from withdrawing any funds", async () => {
          for (const project of [freshProject, partiallyFundedProject]) {
            await expect(
              project.connect(dan).withdraw(ONE_ETHER)
            ).to.revertedWith("Owner only");
          }
        });
      });

      describe("Project Status: Success", () => {
        let project: Project;

        beforeEach(async () => {
          project = await helper.createSuccessfulProject({
            owner: alice,
            goal: HUNDRED_ETHERS,
            contributors: [bob, charlie],
          });
        });

        it("Allows the creator to withdraw some of the contribution balance", async () => {
          const aliceBalanceBefore = await ethers.provider.getBalance(
            alice.address
          );
          const FIVE_ETHERS = ONE_ETHER.mul(5);
          const aliceTRXReceipt = await (
            await project.connect(alice).withdraw(FIVE_ETHERS)
          ).wait();
          const aliceGasCost = helper.getGasCost(aliceTRXReceipt);
          const aliceBalanceAfter = await ethers.provider.getBalance(
            alice.address
          );
          expect(aliceBalanceAfter).to.equal(
            aliceBalanceBefore.add(FIVE_ETHERS).sub(aliceGasCost)
          );
        });

        it("Allows the creator to withdraw the entire contribution balance", async () => {
          const aliceBalanceBefore = await ethers.provider.getBalance(
            alice.address
          );
          const aliceTRXReceipt = await (
            await project.connect(alice).withdraw(HUNDRED_ETHERS)
          ).wait();
          const aliceGasCost = helper.getGasCost(aliceTRXReceipt);
          const aliceBalanceAfter = await ethers.provider.getBalance(
            alice.address
          );
          expect(aliceBalanceAfter).to.equal(
            aliceBalanceBefore.add(HUNDRED_ETHERS).sub(aliceGasCost)
          );
        });

        it("Allows the creator to make multiple withdrawals", async () => {
          const aliceBalanceBefore = await ethers.provider.getBalance(
            alice.address
          );
          const aliceWithdrawals = await series([
            () => project.connect(alice).withdraw(ONE_ETHER),
            () => project.connect(alice).withdraw(ONE_ETHER.mul(2)),
            () => project.connect(alice).withdraw(ONE_ETHER.mul(3)),
            () => project.connect(alice).withdraw(ONE_ETHER.mul(4)),
            () => project.connect(alice).withdraw(ONE_ETHER.mul(5)),
          ]);
          const aliceWithdrawalTransactions = await series(
            aliceWithdrawals.map((x) => () => x.wait())
          );
          const aliceGastCosts = aliceWithdrawalTransactions.map((x) =>
            helper.getGasCost(x)
          );
          const aliceTotalGasCost = aliceGastCosts.reduce(
            (acc, cur) => acc.add(cur),
            BigNumber.from(0)
          );
          const aliceBalanceAfter = await ethers.provider.getBalance(
            alice.address
          );
          // 1 + 2 + 3 + 4 + 5 = 15;
          expect(aliceBalanceAfter).to.equal(
            aliceBalanceBefore.add(ONE_ETHER.mul(15)).sub(aliceTotalGasCost)
          );
        });

        it("Prevents the creator from withdrawing more than the contribution balance", async () => {
          await expect(
            project.connect(alice).withdraw(HUNDRED_ETHERS.add(1))
          ).to.revertedWith("Above total balance");
        });

        it("Emits an Withdrawal event after a withdrawal is made by the creator", async () => {
          const trx = await project.connect(alice).withdraw(HUNDRED_ETHERS);
          const withdrawalEvent = await helper.getSingletonEvent(trx);
          const { args } = withdrawalEvent;
          if (!args) {
            throw new Error("Expected non-empty args array.");
          }
          expect(withdrawalEvent.event).to.equal("Withdrawal");
          expect(args[0]).to.equal(HUNDRED_ETHERS);
        });

        it("Prevents contributors from withdrawing any funds", async () => {
          for (const contributor of [bob, charlie]) {
            await expect(
              project.connect(contributor).withdraw(ONE_ETHER)
            ).to.revertedWith("Owner only");
          }
        });

        it("Prevents non-contributors from withdrawing any funds", async () => {
          await expect(
            project.connect(dan).withdraw(ONE_ETHER)
          ).to.revertedWith("Owner only");
        });
      });

      describe("Project Status: Failure", () => {
        let projects: Array<Project>;

        beforeEach(async () => {
          projects = await series([
            // NOTE: expiring a project will require fast forwarding accross
            // the entire blockchain, effectively expiring the others too.
            // this is why the non-expired projects should be created after
            // the expired ones.
            () =>
              helper.createPartiallyFundedExpiredProject({
                owner: alice,
                goal: HUNDRED_ETHERS,
                contributors: [bob, charlie],
                totalContribution: FIFTY_ETHERS,
              }),
            () =>
              helper.createExpiredProject({
                owner: alice,
                goal: HUNDRED_ETHERS,
              }),
            () =>
              helper.createCancelledProject({
                owner: alice,
                goal: HUNDRED_ETHERS,
              }),

            () =>
              helper.createPartiallyFundedCancelledProject({
                owner: alice,
                goal: HUNDRED_ETHERS,
                contributors: [bob, charlie],
                totalContribution: FIFTY_ETHERS,
              }),
          ]);
        });

        it("Prevents the creator from withdrawing any funds (if not a contributor)", async () => {
          for (const project of projects) {
            await expect(project.connect(alice).withdraw(1)).to.revertedWith(
              "Successful only"
            );
          }
        });

        it("Prevents contributors from withdrawing any funds (though they can still refund)", async () => {
          for (const project of projects) {
            for (const contributor of [bob, charlie]) {
              await expect(
                project.connect(contributor).withdraw(1)
              ).to.revertedWith("Owner only");
            }
          }
        });

        it("Prevents non-contributors from withdrawing any funds", async () => {
          for (const project of projects) {
            await expect(project.connect(dan).withdraw(1)).to.revertedWith(
              "Owner only"
            );
          }
        });
      });
    });

    describe("Refunds", () => {
      let failedProjects: Array<Project>;
      let nonRefundableProjects: Array<Project>;

      beforeEach(async () => {
        failedProjects = await series([
          () =>
            helper.createPartiallyFundedExpiredProject({
              owner: alice,
              goal: HUNDRED_ETHERS,
              contributors: [charlie, bob],
              totalContribution: FIFTY_ETHERS,
            }),
          () =>
            helper.createPartiallyFundedCancelledProject({
              owner: alice,
              goal: HUNDRED_ETHERS,
              contributors: [charlie, bob],
              totalContribution: FIFTY_ETHERS,
            }),
        ]);

        nonRefundableProjects = await series([
          () =>
            helper.createFreshProject({
              owner: alice,
              goal: HUNDRED_ETHERS,
            }),
          () =>
            helper.createSuccessfulProject({
              owner: alice,
              goal: HUNDRED_ETHERS,
            }),
          () =>
            helper.createPartiallyFundedActiveProject({
              owner: alice,
              goal: HUNDRED_ETHERS,
              totalContribution: FIFTY_ETHERS,
              contributors: [bob, charlie],
            }),
        ]);
      });

      it("Allows contributors to be refunded when a project fails", async () => {
        for (const contributor of [charlie, bob]) {
          for (const project of failedProjects) {
            const balanceBeforeRefund = await ethers.provider.getBalance(
              contributor.address
            );
            const receipt = await (
              await project.connect(contributor).refund()
            ).wait();
            const gasCost = helper.getGasCost(receipt);
            const balanceAfterRefund = await ethers.provider.getBalance(
              contributor.address
            );
            expect(balanceAfterRefund.add(gasCost)).to.equal(
              balanceBeforeRefund.add(TWENTY_FIVE_ETHERS)
            );
          }
        }
      });

      it("Prevents contributors from being refunded if a project has not failed", async () => {
        for (const project of nonRefundableProjects) {
          for (const contributor of [bob, charlie]) {
            await expect(project.connect(contributor).refund()).to.revertedWith(
              "Failure only"
            );
          }
        }
      });

      it("Emits a Refund event after a a contributor receives a refund", async () => {
        for (const contributor of [charlie, bob]) {
          for (const project of failedProjects) {
            const trx = await project.connect(contributor).refund();
            const refundEvent = await helper.getSingletonEvent(trx);
            const { args } = refundEvent;
            if (!args) {
              throw new Error("Expected non-empty args array.");
            }
            expect(refundEvent.event).to.equal("Refund");
            expect(args[0]).to.equal(contributor.address);
            expect(args[1]).to.equal(TWENTY_FIVE_ETHERS);
          }
        }
      });
    });

    describe("Cancelations (creator-triggered project failures)", () => {
      const freshProjectThunk = () =>
        helper.createFreshProject({
          owner: alice,
          goal: HUNDRED_ETHERS,
        });

      const partiallyFundedProjectThunk = () =>
        helper.createPartiallyFundedActiveProject({
          owner: alice,
          goal: HUNDRED_ETHERS,
          totalContribution: FIFTY_ETHERS,
        });

      const cancellableDays = [0, 1, 5, 10, 15, 20, 25, 29];
      const uncancellableDays = [30, 31, 35, 40, 50];

      it("Allows the creator to cancel the project if < 30 days since deployment has passed ", async () => {
        for (const daysLater of cancellableDays) {
          for (const createProject of [
            freshProjectThunk,
            partiallyFundedProjectThunk,
          ]) {
            const project = await createProject();
            const initialStatus = await project.connect(alice).status();
            await timeTravel(daysLater * SECONDS_IN_DAY);
            const statusAfterTimeTravel = await project.connect(alice).status();
            await project.connect(alice).cancel();
            const statusAfterCancellation = await project
              .connect(alice)
              .status();
            expect(initialStatus).to.equal(ProjectStatus.ACTIVE);
            expect(statusAfterTimeTravel).to.equal(ProjectStatus.ACTIVE);
            expect(statusAfterCancellation).to.equal(ProjectStatus.FAILURE);
          }
        }
      });

      it("Prevents the creator from canceling the project if at least 30 days have passed", async () => {
        for (const daysLater of uncancellableDays) {
          for (const createProject of [
            freshProjectThunk,
            partiallyFundedProjectThunk,
          ]) {
            const project = await createProject();
            const initialStatus = await project.connect(alice).status();
            await timeTravel(daysLater * SECONDS_IN_DAY);
            const statusAfterTimeTravel = await project.connect(alice).status();
            await expect(project.connect(alice).cancel()).to.revertedWith(
              "Active only"
            );
            const statusAfterCancellation = await project
              .connect(alice)
              .status();
            expect(initialStatus).to.equal(ProjectStatus.ACTIVE);
            expect(statusAfterTimeTravel).to.equal(ProjectStatus.FAILURE);
            expect(statusAfterCancellation).to.equal(ProjectStatus.FAILURE);
          }
        }
      });

      it("Emits a Cancellation event after a project is cancelled by the creator", async () => {
        for (const daysLater of cancellableDays) {
          for (const createProject of [
            freshProjectThunk,
            partiallyFundedProjectThunk,
          ]) {
            const project = await createProject();
            await timeTravel(daysLater * SECONDS_IN_DAY);
            const trx = await project.connect(alice).cancel();
            const cancellationEvent = await helper.getSingletonEvent(trx);
            const { args } = cancellationEvent;
            if (!args) {
              throw new Error("Expected non-empty args array");
            }
            expect(cancellationEvent.event).to.equal("Cancellation");
            const balance = await ethers.provider.getBalance(project.address);
            expect(args[0]).to.equal(balance);
          }
        }
      });
    });

    describe("NFT Contributor Badges", () => {
      let firstProject: Project;
      let secondProject: Project;
      let thirdProject: Project;

      beforeEach(async () => {
        firstProject = await helper.createFreshProject({
          owner: alice,
          goal: HUNDRED_ETHERS,
        });
        secondProject = await helper.createFreshProject({
          owner: bob,
          goal: HUNDRED_ETHERS,
        });
        thirdProject = await helper.createFreshProject({
          owner: charlie,
          goal: HUNDRED_ETHERS,
        });
      });

      it("Awards a contributor with a badge when they make a single contribution of at least 1 ETH", async () => {
        await firstProject.connect(bob).contribute({
          value: ONE_ETHER,
        });
        await firstProject.connect(bob).claimBadge();
        const numBadges = await firstProject.balanceOf(bob.address);
        expect(numBadges).to.equal(1);
      });

      it("Awards a contributor with a badge when they make multiple contributions to a single project that sum to at least 1 ETH", async () => {
        await firstProject.connect(bob).contribute({
          value: ONE_ETHER.div(4),
        });
        await firstProject.connect(bob).contribute({
          value: ONE_ETHER.div(4),
        });
        await firstProject.connect(bob).contribute({
          value: ONE_ETHER.div(4),
        });
        await firstProject.connect(bob).contribute({
          value: ONE_ETHER.div(4),
        });
        await firstProject.connect(bob).claimBadge();
        const numBadges = await firstProject.balanceOf(bob.address);
        expect(numBadges).to.equal(1);
      });

      it("Does not award a contributor with a badge if their total contribution to a single project sums to < 1 ETH", async () => {
        await firstProject.connect(bob).contribute({
          value: ONE_ETHER.sub(1),
        });
        await expect(firstProject.connect(bob).claimBadge()).to.revertedWith(
          "Insufficient contribution"
        );
      });

      it("Awards a contributor with a second badge when their total contribution to a single project sums to at least 2 ETH", async () => {
        await firstProject.connect(bob).contribute({
          value: ONE_ETHER.mul(2),
        });
        // Note: One address can receive multiple badges for a single project,
        //       but they should only receive 1 badge per 1 ETH contributed.
        await firstProject.connect(bob).claimBadge();
        await firstProject.connect(bob).claimBadge();
        const numBadges = await firstProject.balanceOf(bob.address);
        expect(numBadges).to.equal(2);
      });

      it("Does not award a contributor with a second badge if their total contribution to a single project is > 1 ETH but < 2 ETH", async () => {
        await firstProject.connect(bob).contribute({
          value: ONE_ETHER.mul(2).sub(1),
        });
        await firstProject.connect(bob).claimBadge();
        await expect(firstProject.connect(bob).claimBadge()).to.revertedWith(
          "Insufficient contribution"
        );
        const numBadges = await firstProject.balanceOf(bob.address);
        expect(numBadges).to.equal(1);
      });

      it("Awards contributors with different NFTs for contributions to different projects", async () => {
        const projects = [firstProject, secondProject, thirdProject];
        const contributors = [alice, bob, charlie, dan];
        for (const contributor of contributors) {
          for (const project of projects) {
            await project.connect(contributor).contribute({
              value: ONE_ETHER.mul(3),
            });
            await project.connect(contributor).claimBadge();
            await project.connect(contributor).claimBadge();
            await project.connect(contributor).claimBadge();
          }
        }

        for (const contributor of contributors) {
          for (const project of projects) {
            const numBadges = await project.balanceOf(contributor.address);
            expect(numBadges).to.equal(3);
          }
        }
      });

      it("Allows contributor badge holders to trade the NFT to another address", async () => {
        await firstProject.connect(bob).contribute({
          value: ONE_ETHER.mul(3),
        });
        await firstProject.connect(bob).claimBadge();
        await firstProject.connect(bob).claimBadge();
        await firstProject.connect(bob).claimBadge();

        const tokenOwnership = async () => {
          return {
            numBobBadges: await firstProject
              .connect(bob)
              .balanceOf(bob.address),
            numCharlieBadges: await firstProject
              .connect(bob)
              .balanceOf(charlie.address),
            firstBadgeOwner: await firstProject.connect(bob).ownerOf(1),
            secondBadgeOwner: await firstProject.connect(bob).ownerOf(2),
            thirdBadgeOwner: await firstProject.connect(bob).ownerOf(3),
          };
        };

        const initialState = await tokenOwnership();
        expect(initialState.numBobBadges).to.equal(BigNumber.from(3));
        expect(initialState.numCharlieBadges).to.equal(BigNumber.from(0));
        expect(initialState.firstBadgeOwner).to.equal(bob.address);
        expect(initialState.secondBadgeOwner).to.equal(bob.address);
        expect(initialState.thirdBadgeOwner).to.equal(bob.address);

        await firstProject
          .connect(bob)
          .transferFrom(bob.address, charlie.address, 1);
        const afterFirstTrade = await tokenOwnership();
        expect(afterFirstTrade.numBobBadges).to.equal(BigNumber.from(2));
        expect(afterFirstTrade.numCharlieBadges).to.equal(BigNumber.from(1));
        expect(afterFirstTrade.firstBadgeOwner).to.equal(charlie.address);
        expect(afterFirstTrade.secondBadgeOwner).to.equal(bob.address);
        expect(afterFirstTrade.thirdBadgeOwner).to.equal(bob.address);

        await firstProject
          .connect(bob)
          .transferFrom(bob.address, charlie.address, 2);
        const afterSecondTrade = await tokenOwnership();
        expect(afterSecondTrade.numBobBadges).to.equal(BigNumber.from(1));
        expect(afterSecondTrade.numCharlieBadges).to.equal(BigNumber.from(2));
        expect(afterSecondTrade.firstBadgeOwner).to.equal(charlie.address);
        expect(afterSecondTrade.secondBadgeOwner).to.equal(charlie.address);
        expect(afterSecondTrade.thirdBadgeOwner).to.equal(bob.address);

        await firstProject
          .connect(bob)
          .transferFrom(bob.address, charlie.address, 3);
        const afterThirdTrade = await tokenOwnership();
        expect(afterThirdTrade.numBobBadges).to.equal(BigNumber.from(0));
        expect(afterThirdTrade.numCharlieBadges).to.equal(BigNumber.from(3));
        expect(afterThirdTrade.firstBadgeOwner).to.equal(charlie.address);
        expect(afterThirdTrade.secondBadgeOwner).to.equal(charlie.address);
        expect(afterThirdTrade.thirdBadgeOwner).to.equal(charlie.address);
      });

      it("Allows contributor badge holders to trade the NFT to another address even after its related project fails", async () => {
        const failedProject =
          await helper.createPartiallyFundedCancelledProject({
            goal: HUNDRED_ETHERS,
            owner: alice,
            totalContribution: ONE_ETHER.mul(3),
            contributors: [bob, charlie, dan],
          });
        await failedProject.connect(bob).claimBadge();
        await failedProject.connect(charlie).claimBadge();
        await failedProject.connect(dan).claimBadge();

        const firstBadgeOwner = await failedProject.ownerOf(1);
        const secondBadgeOwner = await failedProject.ownerOf(2);
        const thirdBadgeOwner = await failedProject.ownerOf(3);

        expect(firstBadgeOwner).to.equal(bob.address);
        expect(secondBadgeOwner).to.equal(charlie.address);
        expect(thirdBadgeOwner).to.equal(dan.address);
      });
    });
  });
});
