import {Kysely} from "kysely";
import {Database} from "@/test/database.types";


export class DatabaseRuleStorage {

    private db: Kysely<Database>;

    public constructor(db: Kysely<Database>) {
        this.db = db;
    }


}