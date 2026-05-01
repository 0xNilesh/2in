// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title TwinINFT — minimal ERC-7857 reference for the 2in roster.
/// @notice Each tokenId is either a creator's master twin (`mint`) or a
///         specialist cloned from it (`iCloneFrom`). The "intelligence"
///         (system prompt + LoRA adapter pointer + memory slice roots)
///         lives encrypted on 0G Storage; this contract holds only the
///         pointers + integrity/sealed-key fields needed for ownership,
///         transfer, delegation, and per-twin authorization.
///
/// @dev    This is a thin reference, not the production article. The full
///         TEE-verified `iTransferFrom` flow lives in the orchestrator's
///         oracle service (server/) and would normally invoke a TeeVerifier
///         contract here. We intentionally keep transfer untouched (using
///         OZ's ERC721 default) so a hackathon-tier TEE setup is optional.
contract TwinINFT is ERC721, Ownable {
    /* ----------------------------------------------------------------- *
     *  Storage                                                           *
     * ----------------------------------------------------------------- */

    struct TwinMeta {
        bytes32 dataHash;       // keccak256 of the encrypted payload (integrity)
        string  encryptedURI;   // pointer to encrypted payload on 0G Storage
        bytes   sealedKey;      // symmetric key wrapped for current owner pubkey
        uint256 parentTokenId;  // 0 for master, master tokenId for specialists
        address delegate;       // optional hot wallet authorized to act
    }

    /// Per-tokenId iNFT state.
    mapping(uint256 => TwinMeta) private _meta;

    /// authorizations[tokenId][executor] = expiry timestamp (0 = none)
    mapping(uint256 => mapping(address => uint256)) public authorizations;

    /// monotonically-increasing tokenId counter.
    uint256 public nextTokenId;

    /* ----------------------------------------------------------------- *
     *  Events                                                            *
     * ----------------------------------------------------------------- */

    /// Emitted on `mint` (master) and `iCloneFrom` (specialists).
    event TwinMinted(
        uint256 indexed tokenId,
        address indexed owner,
        uint256 indexed parent,
        bytes32 dataHash,
        string  encryptedURI
    );

    /// Emitted on `updateMetadata` — memory snapshot lands on chain.
    event TwinUpgraded(
        uint256 indexed tokenId,
        bytes32 fromHash,
        bytes32 toHash,
        string  newURI
    );

    /// Per-twin rental.
    event UsageAuthorized(uint256 indexed tokenId, address indexed executor, uint256 expiry);
    event UsageRevoked   (uint256 indexed tokenId, address indexed executor);
    event AccessDelegated(uint256 indexed tokenId, address indexed delegate);

    /* ----------------------------------------------------------------- *
     *  Constructor                                                        *
     * ----------------------------------------------------------------- */

    constructor() ERC721("2in Twin INFT", "2IN") Ownable(msg.sender) {}

    /* ----------------------------------------------------------------- *
     *  Mint flows                                                         *
     * ----------------------------------------------------------------- */

    /// @notice Mint a new master twin. Anyone may mint their own master.
    function mint(
        address to,
        bytes32 dataHash,
        string calldata encryptedURI,
        bytes calldata sealedKey
    ) external returns (uint256 tokenId) {
        tokenId = ++nextTokenId;
        _safeMint(to, tokenId);
        _meta[tokenId] = TwinMeta({
            dataHash:       dataHash,
            encryptedURI:   encryptedURI,
            sealedKey:      sealedKey,
            parentTokenId:  0,
            delegate:       address(0)
        });
        emit TwinMinted(tokenId, to, 0, dataHash, encryptedURI);
    }

    /// @notice Clone a specialist from an existing twin you own (or are
    ///         authorized to clone from).
    function iCloneFrom(
        address to,
        uint256 sourceTokenId,
        bytes32 dataHash,
        string calldata encryptedURI,
        bytes calldata sealedKey
    ) external returns (uint256 tokenId) {
        require(_isAuthorizedClone(msg.sender, sourceTokenId), "not_authorized_to_clone");
        tokenId = ++nextTokenId;
        _safeMint(to, tokenId);
        _meta[tokenId] = TwinMeta({
            dataHash:       dataHash,
            encryptedURI:   encryptedURI,
            sealedKey:      sealedKey,
            parentTokenId:  sourceTokenId,
            delegate:       address(0)
        });
        emit TwinMinted(tokenId, to, sourceTokenId, dataHash, encryptedURI);
    }

    /* ----------------------------------------------------------------- *
     *  Memory snapshot                                                   *
     * ----------------------------------------------------------------- */

    /// @notice Re-serialize this twin's payload after a memory delta.
    ///         Owner or delegate only.
    function updateMetadata(
        uint256 tokenId,
        bytes32 newDataHash,
        string calldata newEncryptedURI
    ) external {
        require(_isAuthorizedActor(msg.sender, tokenId), "not_authorized");
        bytes32 prev = _meta[tokenId].dataHash;
        _meta[tokenId].dataHash = newDataHash;
        _meta[tokenId].encryptedURI = newEncryptedURI;
        emit TwinUpgraded(tokenId, prev, newDataHash, newEncryptedURI);
    }

    /* ----------------------------------------------------------------- *
     *  Per-twin rental + delegation                                       *
     * ----------------------------------------------------------------- */

    function authorizeUsage(uint256 tokenId, address executor, uint256 expiry) external {
        require(ownerOf(tokenId) == msg.sender, "not_owner");
        authorizations[tokenId][executor] = expiry;
        emit UsageAuthorized(tokenId, executor, expiry);
    }

    function revokeAuthorization(uint256 tokenId, address executor) external {
        require(ownerOf(tokenId) == msg.sender, "not_owner");
        delete authorizations[tokenId][executor];
        emit UsageRevoked(tokenId, executor);
    }

    function delegateAccess(uint256 tokenId, address delegate) external {
        require(ownerOf(tokenId) == msg.sender, "not_owner");
        _meta[tokenId].delegate = delegate;
        emit AccessDelegated(tokenId, delegate);
    }

    /* ----------------------------------------------------------------- *
     *  Views                                                              *
     * ----------------------------------------------------------------- */

    function getTwin(uint256 tokenId)
        external
        view
        returns (
            address ownerOut,
            bytes32 dataHash,
            string memory encryptedURI,
            bytes memory sealedKey,
            uint256 parentTokenId,
            address delegate
        )
    {
        ownerOut = ownerOf(tokenId);
        TwinMeta storage m = _meta[tokenId];
        dataHash       = m.dataHash;
        encryptedURI   = m.encryptedURI;
        sealedKey      = m.sealedKey;
        parentTokenId  = m.parentTokenId;
        delegate       = m.delegate;
    }

    function authorizationExpiry(uint256 tokenId, address executor)
        external
        view
        returns (uint256)
    {
        return authorizations[tokenId][executor];
    }

    /* ----------------------------------------------------------------- *
     *  Internal                                                           *
     * ----------------------------------------------------------------- */

    function _isAuthorizedActor(address actor, uint256 tokenId) internal view returns (bool) {
        if (ownerOf(tokenId) == actor) return true;
        if (_meta[tokenId].delegate == actor) return true;
        uint256 exp = authorizations[tokenId][actor];
        return exp != 0 && exp >= block.timestamp;
    }

    function _isAuthorizedClone(address actor, uint256 sourceTokenId) internal view returns (bool) {
        // Same as _isAuthorizedActor for now — owner / delegate / live authorization.
        return _isAuthorizedActor(actor, sourceTokenId);
    }

    /// @dev Clear any per-token authorizations on transfer (per ERC-7857).
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = super._update(to, tokenId, auth);
        if (from != address(0) && to != address(0)) {
            _meta[tokenId].delegate = address(0);
            // We can't iterate `authorizations[tokenId]` cheaply on transfer;
            // off-chain indexers are expected to honor the transfer block as
            // the implicit revocation point. Production would track the keys
            // in an array per tokenId for explicit clearing.
        }
        return from;
    }
}
