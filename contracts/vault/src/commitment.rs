//! Payout commitments, byte-for-byte identical to `src/server/commitments.ts`.
//! Specification: docs/COMMITMENTS.md. Shared vectors: tests/vectors/commitments.json.
//!
//! - Leaf = SHA-256("GAJIAN:payout-leaf:v1" ‖ 0x00 ‖ u32be(index) ‖ u8(len) ‖ account ‖ u128be(amount))
//! - Node = SHA-256("GAJIAN:payout-node:v1" ‖ 0x00 ‖ left ‖ right)
//! - Odd last node of a level is promoted unchanged; the tree shape comes from `row_count`,
//!   which the contract stores at run creation (never supplied by the payer).
//!
//! The hash function is a parameter so the contract can use the cheap `env::sha256_array`
//! host function while off-chain tests use a plain SHA-256 implementation.

pub type Hash = [u8; 32];

pub const LEAF_TAG: &[u8] = b"GAJIAN:payout-leaf:v1\0";
pub const NODE_TAG: &[u8] = b"GAJIAN:payout-node:v1\0";
pub const MAX_ROWS: u32 = 1000;

pub fn leaf_hash(
    sha256: impl Fn(&[u8]) -> Hash,
    index: u32,
    account_id: &str,
    amount: u128,
) -> Hash {
    let account = account_id.as_bytes();
    assert!(account.len() <= 64, "account id too long");
    let mut buf = Vec::with_capacity(LEAF_TAG.len() + 4 + 1 + account.len() + 16);
    buf.extend_from_slice(LEAF_TAG);
    buf.extend_from_slice(&index.to_be_bytes());
    buf.push(account.len() as u8);
    buf.extend_from_slice(account);
    buf.extend_from_slice(&amount.to_be_bytes());
    sha256(&buf)
}

pub fn node_hash(sha256: impl Fn(&[u8]) -> Hash, left: &Hash, right: &Hash) -> Hash {
    let mut buf = Vec::with_capacity(NODE_TAG.len() + 64);
    buf.extend_from_slice(NODE_TAG);
    buf.extend_from_slice(left);
    buf.extend_from_slice(right);
    sha256(&buf)
}

/// Recomputes the root from a leaf hash and its proof. Returns false on any mismatch,
/// including a proof that is too short or too long.
pub fn verify_proof(
    sha256: impl Fn(&[u8]) -> Hash + Copy,
    root: &Hash,
    row_count: u32,
    index: u32,
    leaf: Hash,
    proof: &[Hash],
) -> bool {
    if row_count == 0 || row_count > MAX_ROWS || index >= row_count {
        return false;
    }
    let mut hash = leaf;
    let mut pos = index;
    let mut size = row_count;
    let mut used = 0usize;
    while size > 1 {
        if pos % 2 == 1 {
            let Some(sib) = proof.get(used) else {
                return false;
            };
            hash = node_hash(sha256, sib, &hash);
            used += 1;
        } else if pos + 1 < size {
            let Some(sib) = proof.get(used) else {
                return false;
            };
            hash = node_hash(sha256, &hash, sib);
            used += 1;
        }
        pos /= 2;
        size = size.div_ceil(2);
    }
    used == proof.len() && &hash == root
}

/// Builds all proofs for ordered leaf hashes (off-chain helper for tests and tooling).
pub fn root_and_proofs(
    sha256: impl Fn(&[u8]) -> Hash + Copy,
    leaves: &[Hash],
) -> (Hash, Vec<Vec<Hash>>) {
    assert!(!leaves.is_empty(), "at least one leaf");
    let mut proofs: Vec<Vec<Hash>> = vec![Vec::new(); leaves.len()];
    let mut positions: Vec<usize> = (0..leaves.len()).collect();
    let mut level: Vec<Hash> = leaves.to_vec();
    while level.len() > 1 {
        for (i, pos) in positions.iter_mut().enumerate() {
            let sibling = if *pos % 2 == 1 { *pos - 1 } else { *pos + 1 };
            if sibling < level.len() {
                proofs[i].push(level[sibling]);
            }
            *pos /= 2;
        }
        level = level
            .chunks(2)
            .map(|pair| match pair {
                [l, r] => node_hash(sha256, l, r),
                [single] => *single,
                _ => unreachable!(),
            })
            .collect();
    }
    (level[0], proofs)
}

/// Parses 64 lowercase hex characters into a hash.
pub fn parse_hash(hex: &str) -> Option<Hash> {
    let bytes = hex.as_bytes();
    if bytes.len() != 64 {
        return None;
    }
    let nibble = |c: u8| match c {
        b'0'..=b'9' => Some(c - b'0'),
        b'a'..=b'f' => Some(c - b'a' + 10),
        _ => None,
    };
    let mut out = [0u8; 32];
    for (i, chunk) in bytes.chunks(2).enumerate() {
        out[i] = (nibble(chunk[0])? << 4) | nibble(chunk[1])?;
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::serde_json::{self, Value};

    fn sha(data: &[u8]) -> Hash {
        near_sdk::env::sha256_array(data)
    }

    fn h(v: &Value) -> Hash {
        parse_hash(v.as_str().unwrap()).unwrap()
    }

    const VECTORS: &str = include_str!("../../../tests/vectors/commitments.json");

    #[test]
    fn shared_vectors_match_typescript() {
        let v: Value = serde_json::from_str(VECTORS).unwrap();
        let mut checked = 0;
        for c in v["leaves"].as_array().unwrap() {
            let leaf = leaf_hash(
                sha,
                c["index"].as_u64().unwrap() as u32,
                c["account_id"].as_str().unwrap(),
                c["amount"].as_str().unwrap().parse().unwrap(),
            );
            assert_eq!(leaf, h(&c["leaf"]));
            checked += 1;
        }
        for t in v["trees"].as_array().unwrap() {
            let rows = t["rows"].as_array().unwrap();
            let count = t["row_count"].as_u64().unwrap() as u32;
            let root = h(&t["root"]);
            let leaves: Vec<Hash> = rows
                .iter()
                .map(|r| {
                    leaf_hash(
                        sha,
                        r["index"].as_u64().unwrap() as u32,
                        r["account_id"].as_str().unwrap(),
                        r["amount"].as_str().unwrap().parse().unwrap(),
                    )
                })
                .collect();
            let (computed_root, proofs) = root_and_proofs(sha, &leaves);
            assert_eq!(computed_root, root, "root of {}", t["name"]);
            for (i, r) in rows.iter().enumerate() {
                assert_eq!(leaves[i], h(&r["leaf"]));
                let proof: Vec<Hash> = r["proof"].as_array().unwrap().iter().map(h).collect();
                assert_eq!(proofs[i], proof, "proof {i} of {}", t["name"]);
                assert!(verify_proof(sha, &root, count, i as u32, leaves[i], &proof));
            }
            checked += 1;
        }
        assert_eq!(checked, 8);
    }

    #[test]
    fn tampered_rows_fail() {
        let leaves: Vec<Hash> = (0..5u32)
            .map(|i| leaf_hash(sha, i, "recipient1.gajian-payroll.testnet", 10_000))
            .collect();
        let (root, proofs) = root_and_proofs(sha, &leaves);
        let good = |i: u32, acct: &str, amt: u128| {
            verify_proof(sha, &root, 5, i, leaf_hash(sha, i, acct, amt), &proofs[1])
        };
        assert!(good(1, "recipient1.gajian-payroll.testnet", 10_000));
        assert!(!good(1, "recipient1.gajian-payroll.testnet", 10_001)); // amount
        assert!(!good(1, "attacker.testnet", 10_000)); // destination
        assert!(!good(2, "recipient1.gajian-payroll.testnet", 10_000)); // index (same wallet + amount)
        assert!(!verify_proof(sha, &root, 5, 1, leaves[1], &proofs[1][1..]));
        let mut long = proofs[1].clone();
        long.push(root);
        assert!(!verify_proof(sha, &root, 5, 1, leaves[1], &long));
        assert!(!verify_proof(sha, &root, 5, 5, leaves[1], &proofs[1]));
        assert!(!verify_proof(sha, &root, 0, 0, leaves[0], &[]));
    }

    #[test]
    fn thousand_rows_have_ten_level_proofs() {
        let leaves: Vec<Hash> = (0..1000u32)
            .map(|i| leaf_hash(sha, i, "gjn-emp-0001.testnet", 10_000))
            .collect();
        let (root, proofs) = root_and_proofs(sha, &leaves);
        assert_eq!(proofs.iter().map(Vec::len).max(), Some(10));
        assert!(verify_proof(
            sha,
            &root,
            1000,
            999,
            leaves[999],
            &proofs[999]
        ));
        assert!(verify_proof(sha, &root, 1000, 0, leaves[0], &proofs[0]));
    }

    #[test]
    fn hex_parsing_is_strict() {
        assert!(parse_hash(&"ab".repeat(32)).is_some());
        assert!(parse_hash(&"AB".repeat(32)).is_none());
        assert!(parse_hash(&"ab".repeat(31)).is_none());
        assert!(parse_hash(&"zz".repeat(32)).is_none());
    }
}
