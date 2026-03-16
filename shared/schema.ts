import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users / Clients
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

// Client projects tracked by the swarm
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  mode: text("mode").notNull().default("copilot"), // 'copilot' | 'autopilot'
  visibilityScore: real("visibility_score").default(0),
  activeAgents: integer("active_agents").default(0),
});

// Agent activity log entries
export const agentLogs = pgTable("agent_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  agentType: text("agent_type").notNull(), // 'scraper' | 'writer' | 'auditor' | 'outreach' | 'cro'
  action: text("action").notNull(),
  status: text("status").notNull().default("running"), // 'running' | 'completed' | 'failed' | 'pending_approval'
  detail: text("detail"),
  timestamp: timestamp("timestamp").defaultNow(),
});

// AI Visibility checks
export const visibilityChecks = pgTable("visibility_checks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  keyword: text("keyword").notNull(),
  cited: boolean("cited").default(false),
  source: text("source"),
  checkedAt: timestamp("checked_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true });
export const insertAgentLogSchema = createInsertSchema(agentLogs).omit({ id: true });
export const insertVisibilityCheckSchema = createInsertSchema(visibilityChecks).omit({ id: true });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type AgentLog = typeof agentLogs.$inferSelect;
export type VisibilityCheck = typeof visibilityChecks.$inferSelect;
