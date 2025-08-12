import {RulesExecutionService} from "./engine/RulesExecutionService";
import {Kysely} from "kysely";
import {MatchRule} from "./entities/MatchRule";

export class RulesService {

    private db: Kysely<any>;

    public constructor(db: Kysely<any>) {
        this.db = db;
    }

    public async processRules(rules: MatchRule[], targetTableName: string): Promise<number> {
        const execution = new RulesExecutionService(this.db);
        const resultsTableName = await execution.resetResultsTableIfExists(targetTableName);
        const executedRules = await execution.applyRules(rules, resultsTableName);

        return executedRules;
    }
}