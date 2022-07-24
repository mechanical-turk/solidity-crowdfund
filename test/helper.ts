import { ethers, network } from "hardhat";
import { BigNumber, ContractReceipt, ContractTransaction } from "ethers";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ProjectFactory, Project } from "../typechain";

type NonEmptyArray<T> = [T, ...T[]];

/* eslint-disable */
export enum ProjectStatus {
  ACTIVE,
  SUCCESS,
  FAILURE,
}
/* eslint-enable */

// Set of context-aware utilities, helpers and variables
// to help with testing.
export class Helper {
  constructor(
    public readonly projectFactory: ProjectFactory,
    public readonly signers: {
      readonly deployer: SignerWithAddress;
      readonly alice: SignerWithAddress;
      readonly bob: SignerWithAddress;
      readonly charlie: SignerWithAddress;
      readonly dan: SignerWithAddress;
    },
    private readonly secretSigner: SignerWithAddress // used only internally from within the helper
  ) {}

  static async init(): Promise<Helper> {
    const [deployer, alice, bob, charlie, dan, secretSigner] =
      await ethers.getSigners();
    const ProjectFactory = await ethers.getContractFactory("ProjectFactory");
    const projectFactory = await ProjectFactory.deploy();
    await projectFactory.deployed();
    return new Helper(
      projectFactory,
      {
        deployer,
        alice,
        bob,
        charlie,
        dan,
      },
      secretSigner
    );
  }

  public async createFreshProject(params: {
    owner: SignerWithAddress;
    goal: BigNumber;
  }): Promise<Project> {
    const trx = await this.projectFactory
      .connect(params.owner)
      .create(params.goal, "My Project", "MPT");
    return this.getProjectCreatedFromTRX(trx);
  }

  // equally divides the burden between a given set of contributors
  private async contribute(params: {
    project: Project;
    contributors: NonEmptyArray<SignerWithAddress>;
    totalAmount: BigNumber;
  }) {
    const perPerson = params.totalAmount.div(params.contributors.length);
    let remaining = params.totalAmount;
    for (const contributor of params.contributors) {
      if (remaining.gt(0)) {
        await params.project.connect(contributor).contribute({
          value: perPerson,
        });
      }
      remaining = remaining.sub(perPerson);
    }
    if (remaining.gt(0)) {
      await params.project.connect(params.contributors[0]).contribute({
        value: perPerson,
      });
    }
  }

  public async createSuccessfulProject(params: {
    owner: SignerWithAddress;
    goal: BigNumber;
    contributors?: NonEmptyArray<SignerWithAddress>;
  }): Promise<Project> {
    const project = await this.createFreshProject(params);
    await this.contribute({
      project,
      totalAmount: params.goal,
      contributors: params.contributors || [this.secretSigner],
    });
    const status = await project.status();
    if (status !== ProjectStatus.SUCCESS) {
      throw new Error("Expected successful project");
    }
    return project;
  }

  public async createCancelledProject(params: {
    owner: SignerWithAddress;
    goal: BigNumber;
  }): Promise<Project> {
    const project = await this.createFreshProject(params);
    await project.connect(params.owner).cancel();
    const status = await project.status();
    if (status !== ProjectStatus.FAILURE) {
      throw new Error("Expected failed project");
    }
    return project;
  }

  public async createExpiredProject(params: {
    owner: SignerWithAddress;
    goal: BigNumber;
  }): Promise<Project> {
    const project = await this.createFreshProject(params);
    await timeTravel(SECONDS_IN_LITTLE_OVER_30_DAYS);
    const status = await project.status();
    if (status !== ProjectStatus.FAILURE) {
      throw new Error("Expected failed project");
    }
    return project;
  }

  public async createPartiallyFundedActiveProject(params: {
    owner: SignerWithAddress;
    goal: BigNumber;
    contributors?: NonEmptyArray<SignerWithAddress>;
    totalContribution: BigNumber;
  }): Promise<Project> {
    const project = await this.createFreshProject(params);
    await this.contribute({
      project,
      contributors: params.contributors || [this.secretSigner],
      totalAmount: params.totalContribution,
    });
    const status = await project.status();
    if (status !== ProjectStatus.ACTIVE) {
      throw new Error("Expected active project");
    }
    return project;
  }

  public async createPartiallyFundedCancelledProject(params: {
    owner: SignerWithAddress;
    goal: BigNumber;
    contributors?: NonEmptyArray<SignerWithAddress>;
    totalContribution: BigNumber;
  }): Promise<Project> {
    const project = await this.createPartiallyFundedActiveProject(params);
    await project.connect(params.owner).cancel();
    const status = await project.status();
    if (status !== ProjectStatus.FAILURE) {
      throw new Error("Expected failed project");
    }
    return project;
  }

  public async createPartiallyFundedExpiredProject(params: {
    owner: SignerWithAddress;
    goal: BigNumber;
    contributors?: NonEmptyArray<SignerWithAddress>;
    totalContribution: BigNumber;
  }): Promise<Project> {
    const project = await this.createPartiallyFundedActiveProject(params);
    await timeTravel(SECONDS_IN_LITTLE_OVER_30_DAYS);
    const status = await project.status();
    if (status !== ProjectStatus.FAILURE) {
      throw new Error("Expected failed project");
    }
    return project;
  }

  public async getSingletonEvent(trx: ContractTransaction) {
    const receipt = await trx.wait();
    const { events } = receipt;
    if (!events) {
      throw new Error("Expected an events array, got undefined instead.");
    }
    if (events.length !== 1) {
      throw new Error(
        "Expected a singleton events array, got empty or larger array instead."
      );
    }
    return events[0];
  }

  public async getBalances() {
    const accounts = [
      this.signers.alice,
      this.signers.bob,
      this.signers.charlie,
      this.signers.dan,
    ];
    const [alice, bob, charlie, dan] = await Promise.all(
      accounts.map((acc) => ethers.provider.getBalance(acc.address))
    );
    return {
      alice,
      bob,
      charlie,
      dan,
    };
  }

  public async getProjectFields(project: Project) {
    const connectedProject = project.connect(this.signers.deployer);
    const [owner, goal, status, name, symbol] = await Promise.all([
      connectedProject.owner(),
      connectedProject.goal(),
      connectedProject.status(),
      connectedProject.name(),
      connectedProject.symbol(),
    ]);
    return { owner, goal, status, name, symbol };
  }

  public async getProjectCreatedFromTRX(trx: ContractTransaction) {
    const projectCreatedEvent = await this.getSingletonEvent(trx);
    const { args } = projectCreatedEvent;
    if (!args) {
      throw new Error("Expected event to have arguments");
    }
    const project = await this.getProjectAtAddress(args[0]);
    const status = await project.status();
    if (status !== ProjectStatus.ACTIVE) {
      throw new Error("Expected active project");
    }
    return project;
  }

  public async getProjectAtAddress(address: string) {
    const project = await ethers.getContractAt("Project", address);

    try {
      await project.connect(this.signers.deployer).goal();
    } catch (e) {
      console.error(e);
      throw new Error(
        `Expected project to exist at: ${address}, got an error instead.`
      );
    }
    return project;
  }

  getGasCost(receipt: ContractReceipt) {
    return BigNumber.from(receipt.cumulativeGasUsed).mul(
      receipt.effectiveGasPrice
    );
  }
}

/* eslint-disable */
export type Balances = Awaited<ReturnType<Helper["getBalances"]>>;
/* eslint-enable */

// ----------------------------------------------------------------------------
// OPTIONAL: Constants and Helper Functions
// ----------------------------------------------------------------------------
// We've put these here for your convenience. Feel free to use them if they
// are helpful!
export const SECONDS_IN_DAY: number = 60 * 60 * 24;
export const SECONDS_IN_LITTLE_OVER_30_DAYS = 30 * SECONDS_IN_DAY + 100;
export const ONE_ETHER: BigNumber = ethers.utils.parseEther("1");
export const FIVE_ETHERS = ONE_ETHER.mul(5);
export const TWENTY_FIVE_ETHERS = ONE_ETHER.mul(25);
export const FIFTY_ETHERS = ONE_ETHER.mul(50);
export const HUNDRED_ETHERS = ONE_ETHER.mul(100);

// Bump the timestamp by a specific amount of seconds
export const timeTravel = async (seconds: number) => {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
};

// Or, set the time to be a specific amount (in seconds past epoch time)
export const setBlockTimeTo = async (seconds: number) => {
  await network.provider.send("evm_setNextBlockTimestamp", [seconds]);
  await network.provider.send("evm_mine");
};
// ----------------------------------------------------------------------------

export const series = async <T>(
  thunks: Array<() => Promise<T>>
): Promise<Array<T>> => {
  const result: Array<T> = [];
  for (const t of thunks) {
    const cur = await t();
    result.push(cur);
  }
  return result;
};
