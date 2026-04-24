"use strict";
/**
 * Reconcile brawler types + regenerate counter matchups.
 *
 * Step 1: Rewrites every brawler's role/type from BRAWLER_TYPE_OVERRIDES.
 * Step 2: Regenerates counter matchup advantageScore + reason for every
 *         existing matchup row, using the (now-correct) types.
 *
 * Scoring is DETERMINISTIC (hash-based pseudo-random per brawler pair),
 * so running this twice gives identical results — no score shuffling.
 *
 * Does NOT touch: HP, iconUrl, externalId, map stats, or any other data.
 *
 * Usage:
 *   npx tsx scripts/reconcile-brawler-types.ts              # full fix
 *   npx tsx scripts/reconcile-brawler-types.ts --dry-run    # preview only
 *   npx tsx scripts/reconcile-brawler-types.ts --skip-matchups  # just types
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var client_1 = require("@prisma/client");
var constants_1 = require("../src/lib/constants");
var prisma = new client_1.PrismaClient();
var DRY_RUN = process.argv.includes("--dry-run");
var SKIP_MATCHUPS = process.argv.includes("--skip-matchups");
/**
 * Deterministic pseudo-random in [0, 1) based on a string.
 * Same input -> same output, so re-runs don't reshuffle matchup scores.
 */
function stableRand(seed) {
    var h = 2166136261;
    for (var i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 100000) / 100000;
}
function computeMatchupScore(attackerName, attackerType, defenderName, defenderType) {
    var info = constants_1.COUNTER_MATRIX[attackerType];
    var rand = stableRand("".concat(attackerName, "|").concat(defenderName));
    if (!info) {
        return {
            score: Math.round((-0.5 + rand) * 10) / 10,
            reason: "Neutral matchup, depends on skill and positioning",
        };
    }
    if (info.strongVs.includes(defenderType)) {
        return {
            score: Math.round((1.5 + rand) * 10) / 10,
            reason: "".concat(attackerName, " (").concat(attackerType, ") counters ").concat(defenderName, " (").concat(defenderType, ")"),
        };
    }
    if (info.weakVs.includes(defenderType)) {
        return {
            score: Math.round(-(1.5 + rand) * 10) / 10,
            reason: "".concat(attackerName, " (").concat(attackerType, ") is weak against ").concat(defenderName, " (").concat(defenderType, ")"),
        };
    }
    return {
        score: Math.round((-0.5 + rand) * 10) / 10,
        reason: "Neutral matchup, depends on skill and positioning",
    };
}
function reconcileBrawlers() {
    return __awaiter(this, void 0, void 0, function () {
        var dbBrawlers, changes, unchanged, notInOverrides, dbNameSet, notInDb, _i, dbBrawlers_1, brawler, override;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("\n[1/2] Reconciling brawler roles and types...");
                    return [4 /*yield*/, prisma.brawler.findMany({ orderBy: { name: "asc" } })];
                case 1:
                    dbBrawlers = _a.sent();
                    changes = [];
                    unchanged = [];
                    notInOverrides = [];
                    dbNameSet = new Set(dbBrawlers.map(function (b) { return b.name; }));
                    notInDb = Object.keys(constants_1.BRAWLER_TYPE_OVERRIDES).filter(function (n) { return !dbNameSet.has(n); });
                    _i = 0, dbBrawlers_1 = dbBrawlers;
                    _a.label = 2;
                case 2:
                    if (!(_i < dbBrawlers_1.length)) return [3 /*break*/, 5];
                    brawler = dbBrawlers_1[_i];
                    override = constants_1.BRAWLER_TYPE_OVERRIDES[brawler.name];
                    if (!override) {
                        notInOverrides.push(brawler.name);
                        return [3 /*break*/, 4];
                    }
                    if (brawler.role === override.role && brawler.type === override.type) {
                        unchanged.push(brawler.name);
                        return [3 /*break*/, 4];
                    }
                    changes.push({
                        name: brawler.name,
                        old: "".concat(brawler.role, " / ").concat(brawler.type),
                        new: "".concat(override.role, " / ").concat(override.type),
                    });
                    if (!!DRY_RUN) return [3 /*break*/, 4];
                    return [4 /*yield*/, prisma.brawler.update({
                            where: { id: brawler.id },
                            data: { role: override.role, type: override.type },
                        })];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5:
                    console.log("  Scanned:   ".concat(dbBrawlers.length));
                    console.log("  Unchanged: ".concat(unchanged.length));
                    console.log("  Updated:   ".concat(changes.length));
                    console.log("  In DB but no override: ".concat(notInOverrides.length));
                    console.log("  In override but not in DB: ".concat(notInDb.length));
                    if (changes.length > 0) {
                        console.log("\n  --- Type/role changes ".concat(DRY_RUN ? "(would apply)" : "(applied)", " ---"));
                        changes.forEach(function (c) {
                            return console.log("    ".concat(c.name.padEnd(18), " ").concat(c.old.padEnd(22), " -> ").concat(c.new));
                        });
                    }
                    if (notInOverrides.length > 0) {
                        console.log("\n  --- In DB but missing from BRAWLER_TYPE_OVERRIDES ---");
                        notInOverrides.forEach(function (n) { return console.log("    ".concat(n)); });
                        console.log("    (Add these to constants.ts and re-run.)");
                    }
                    if (notInDb.length > 0) {
                        console.log("\n  --- Pre-listed but not yet in DB ---");
                        notInDb.forEach(function (n) { return console.log("    ".concat(n)); });
                    }
                    return [2 /*return*/];
            }
        });
    });
}
function reconcileMatchups() {
    return __awaiter(this, void 0, void 0, function () {
        var brawlers, byId, matchups, updated, unchanged, skipped, _i, matchups_1, m, attacker, defender, _a, score, reason;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    console.log("\n[2/2] Regenerating counter matchups...");
                    return [4 /*yield*/, prisma.brawler.findMany()];
                case 1:
                    brawlers = _b.sent();
                    byId = new Map(brawlers.map(function (b) { return [b.id, b]; }));
                    return [4 /*yield*/, prisma.counterMatchup.findMany()];
                case 2:
                    matchups = _b.sent();
                    console.log("  Existing matchup rows: ".concat(matchups.length));
                    if (matchups.length === 0) {
                        console.log("  No matchups in DB. Skipping.");
                        console.log("  (If your harvest doesn't generate matchups, run your seed script.)");
                        return [2 /*return*/];
                    }
                    updated = 0;
                    unchanged = 0;
                    skipped = 0;
                    _i = 0, matchups_1 = matchups;
                    _b.label = 3;
                case 3:
                    if (!(_i < matchups_1.length)) return [3 /*break*/, 7];
                    m = matchups_1[_i];
                    attacker = byId.get(m.brawlerId);
                    defender = byId.get(m.counterId);
                    if (!attacker || !defender) {
                        skipped++;
                        return [3 /*break*/, 6];
                    }
                    _a = computeMatchupScore(attacker.name, attacker.type, defender.name, defender.type), score = _a.score, reason = _a.reason;
                    if (m.advantageScore === score && m.reason === reason) {
                        unchanged++;
                        return [3 /*break*/, 6];
                    }
                    if (!!DRY_RUN) return [3 /*break*/, 5];
                    return [4 /*yield*/, prisma.counterMatchup.update({
                            where: { brawlerId_counterId: { brawlerId: m.brawlerId, counterId: m.counterId } },
                            data: { advantageScore: score, reason: reason },
                        })];
                case 4:
                    _b.sent();
                    _b.label = 5;
                case 5:
                    updated++;
                    _b.label = 6;
                case 6:
                    _i++;
                    return [3 /*break*/, 3];
                case 7:
                    console.log("  Unchanged: ".concat(unchanged));
                    console.log("  Updated:   ".concat(updated));
                    if (skipped > 0)
                        console.log("  Skipped (orphan refs): ".concat(skipped));
                    return [2 /*return*/];
            }
        });
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("\n=== Brawler Reconcile ".concat(DRY_RUN ? "(DRY RUN)" : "").concat(SKIP_MATCHUPS ? " [SKIP MATCHUPS]" : "", " ==="));
                    return [4 /*yield*/, reconcileBrawlers()];
                case 1:
                    _a.sent();
                    if (!SKIP_MATCHUPS) return [3 /*break*/, 2];
                    console.log("\n[2/2] Skipped (--skip-matchups).");
                    return [3 /*break*/, 4];
                case 2: return [4 /*yield*/, reconcileMatchups()];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4:
                    console.log("\n=== Done ===\n");
                    return [2 /*return*/];
            }
        });
    });
}
main()
    .catch(function (e) {
    console.error("Reconcile failed:", e);
    process.exit(1);
})
    .finally(function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, prisma.$disconnect()];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
