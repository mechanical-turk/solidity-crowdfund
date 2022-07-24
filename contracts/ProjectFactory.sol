//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.14;

import "./Project.sol";

contract ProjectFactory {
    // Fired when a project is created, using the create() factory function
    event ProjectCreated(address projectAddress, address owner, uint256 goal);

    // Used to determine how long the contract has to get fully funded, before expiring
    uint256 constant projectValidFor = 30 days;

    /**
     * This is a factory function, used to create and deploy independent
     * Project contracts with a given target goal, owned by msg.sender and 
     * expiring after (projectValidFor) days,
     */
    function create(
        uint256 _goal,
        string memory _tokenName,
        string memory _tokenSymbol
    ) external {
        Project project = new Project(
            msg.sender,
            _tokenName,
            _tokenSymbol,
            _goal,
            block.timestamp + projectValidFor
        );

        emit ProjectCreated(address(project), msg.sender, _goal);
    }
}
