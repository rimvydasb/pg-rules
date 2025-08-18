import {Generated, Insertable, Selectable, Updateable} from 'kysely';

// Database schema interfaces
export interface UserTable {
    id: Generated<number>;
    email?: string;
    name?: string;
    role?: string;
    status?: string;
    age?: number;
    isVerified?: boolean;
    priority?: number;
    phone?: string;
    appliedRules?: string[];
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
}

export interface PostTable {
    id: Generated<number>;
    title: string;
    content: string;
    author_id: number;
    published: boolean;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
}

// Database interface
export interface Database {
    users: UserTable;
    users_results: UserTable;
    posts: PostTable;
}

// Type helpers for easier usage
export type User = Selectable<UserTable>;
export type NewUser = Insertable<UserTable>;
export type UserUpdate = Updateable<UserTable>;

export type Post = Selectable<PostTable>;
export type NewPost = Insertable<PostTable>;
export type PostUpdate = Updateable<PostTable>;
