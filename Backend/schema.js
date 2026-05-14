import { pgTable, serial, text, varchar, timestamp, boolean, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: text('password').notNull(),
  role: varchar('role', { length: 50 }).notNull().default('user'),
  otp: varchar('otp', { length: 6 }),
  otp_expiry: timestamp('otp_expiry'),
  is_verified: boolean('is_verified').notNull().default(false),
  created_at: timestamp('created_at').defaultNow(),
});

export const complaints = pgTable('complaints', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  complaintText: text('complaint_text').notNull(),
  aiQuestion: text('ai_question'),
  userAnswer: text('user_answer'),
  created_at: timestamp('created_at').defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  complaints: many(complaints),
}));

export const complaintsRelations = relations(complaints, ({ one }) => ({
  user: one(users, {
    fields: [complaints.userId],
    references: [users.id],
  }),
}));
