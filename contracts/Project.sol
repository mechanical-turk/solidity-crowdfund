//SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.14;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract Project is ERC721 {
    // Enum that represents what the entirety of the internal contract state boils down to
    enum ProjectStatus {
        ACTIVE,
        SUCCESS,
        FAILURE
    }

    // Fired when the project owner withdraws from the contract balance
    event Withdrawal(uint256 amount);

    // Fired when the project owner cancels the project
    event Cancellation(uint256 balance);

    // Fired when a contribution is made
    event Contribution(address contributor, uint256 contribution);

    // Fired when a contributor refunds themselves their prior contribution
    event Refund(address contributor, uint256 amount);

    // The minimum amount of weis that are allowed to be contributed into the project
    uint256 public constant minimumContribution = (1 ether / 100);

    // Owner of the project, the only address with withdrawal and cancellation privileges
    address public immutable owner;

    // The target goal of the project in weis
    uint256 public immutable goal;

    // The block timestamp at which the project expires / fails
    uint256 public immutable expiresAt;

    // Locking variable that determines if the contract was successfully funded
    bool public isFundingGoalAchieved;

    // Locking variable that determiens if the contract was cancelled
    bool public isCancelled;

    // Used to ensure no 2 distinct contributors attempt to mint a badge NFT with the same tokenId
    uint256 private lastBadgeId;

    // Records total contributions done by each contributor, in weis
    mapping(address => uint256) private contributions;

    // Accounting variable to store the total amount of ETH contributed.
    uint256 contributionsTotal;

    // Tracks how much of a given contributor's contributions was claimed as an NFT badge
    mapping(address => uint256) private badgeClaims;

    constructor(
        address _owner,
        string memory _name_,
        string memory _symbol_,
        uint256 _goal,
        uint256 _expiresAt
    ) ERC721(_name_, _symbol_) {
        require(
            _goal >= minimumContribution,
            "Goal is less than minimum contribution."
        );
        owner = _owner;
        goal = _goal;
        expiresAt = _expiresAt;
    }

    /**
     * Used to mark functions that are only intended to be run
     * by the project owner, and noone else
     */
    modifier isOwner() {
        require(owner == msg.sender, "Owner only");
        _;
    }

    /**
     * When called by the project owner, this function will transfer
     * the entire balance of the contract into the owner's account, given
     * the project is successfully funded.
     */
    function withdraw(uint256 amount) external isOwner {
        require(status() == ProjectStatus.SUCCESS, "Successful only");
        require(amount <= contributionsTotal, "Above total balance");
        emit Withdrawal(amount);
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Eth send failed");
    }

    /**
     * When called by the project owner, this function will cancel
     * the project, given that the project is still active. Once
     * cancelled, the contributors are allowed to refund themselves
     * their contributions.
     */
    function cancel() external isOwner {
        require(status() == ProjectStatus.ACTIVE, "Active only");
        isCancelled = true;
        emit Cancellation(contributionsTotal);
    }

    /**
     * This function allows any account to deposit a contribution into
     * the project contract, given that the project is still active
     * and that their contribution is above the minimum limit.
     */
    function contribute() external payable {
        require(msg.value >= minimumContribution, "Below minimum");
        require(status() == ProjectStatus.ACTIVE, "Active only");
        contributionsTotal += msg.value;
        if (contributionsTotal >= goal) {
            isFundingGoalAchieved = true;
        }
        contributions[msg.sender] += msg.value;
        emit Contribution(msg.sender, msg.value);
    }

    /**
     * This function allows prior contributors to refund themselves
     * their prior contribution, given that the project has failed.
     */
    function refund() external {
        require(status() == ProjectStatus.FAILURE, "Failure only");
        uint256 contribution = contributions[msg.sender];
        require(contribution > 0, "Insufficient contribution");
        delete contributions[msg.sender];
        emit Refund(msg.sender, contribution);
        (bool success, ) = msg.sender.call{value: contribution}("");
        require(success, "Eth send failed");
    }

    /**
     * This function allows prior contributors to mint themselves
     * and NFT contribution badge, given that they still have at least
     * 1 ETH worth of unclaimed contributions (i.e not claimed as an NFT badge)
     */
    function claimBadge() external {
        uint256 remainingBadges = (contributions[msg.sender] -
            badgeClaims[msg.sender]) / (1 ether);
        require(remainingBadges > 0, "Insufficient contribution");
        badgeClaims[msg.sender] += 1 ether;
        lastBadgeId++;
        _safeMint(msg.sender, lastBadgeId);
    }

    /**
     * This function reduces the entire internal state of the contract
     * into 3 status variables: SUCCESS, FAILURE, and ACTIVE. This
     * reduction is crucial in determining legal and illegal state
     * changes.
     */
    function status() public view returns (ProjectStatus) {
        if (isFundingGoalAchieved) {
            return ProjectStatus.SUCCESS;
        } else if (block.timestamp >= expiresAt || isCancelled) {
            return ProjectStatus.FAILURE;
        } else {
            return ProjectStatus.ACTIVE;
        }
    }
}
