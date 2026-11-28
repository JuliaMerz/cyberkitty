/* tslint:disable */
/* eslint-disable */
/**
/* This file was automatically generated from pydantic models by running pydantic2ts.
/* Do not modify it by hand - just update the pydantic models and then re-run the script
*/

export interface ApiCall {
  is_public?: boolean;
  query_id: number;
  timestamp?: string;
  success?: boolean;
  error?: string;
  cost?: number;
  output: string;
  created_on?: string;
  updated_on?: string;
  id?: number;
  input_messages?: string;
}
export interface ChapterOutline {
  is_public?: boolean;
  story_outline_id: number;
  previous_chapter_id?: number;
  part_label?: string;
  chapter_number: number;
  title: string;
  purpose: string;
  main_events: string;
  chapter_summary: string;
  chapter_notes: string;
  raw?: string;
  edit_notes?: string;
  improved?: string;
  id?: number;
  author_id: number;
  modified?: boolean;
  invalidated?: boolean;
  created_on?: string;
  updated_on?: string;
}
export interface ChapterOutlineRead {
  is_public?: boolean;
  story_outline_id: number;
  previous_chapter_id?: number;
  part_label?: string;
  chapter_number: number;
  title: string;
  purpose: string;
  main_events: string;
  chapter_summary: string;
  chapter_notes: string;
  raw?: string;
  edit_notes?: string;
  improved?: string;
  id: number;
  author_id: number;
  modified: boolean;
  invalidated: boolean;
  created_on: string;
  updated_on: string;
  raw_parsed: ChapterOutlineInnerParsed[];
  improved_parsed: ChapterOutlineInnerParsed[];
  story_outline: StoryOutline;
  author: User;
  current_scene_outlines: SceneOutlineRead[];
  previous_chapter?: ChapterOutlineRead;
  next_chapter?: ChapterOutlineRead;
}
export interface ChapterOutlineInnerParsed {
  scene_number: string;
  setting: string;
  primary_function: string;
  secondary_function: string;
  summary: string;
  context: string;
}
export interface StoryOutline {
  is_public?: boolean;
  story_id: number;
  outline_onesentence?: string;
  outline_mainevents_raw?: string;
  editing_notes?: string;
  outline_mainevents_improved?: string;
  outline_paragraphs?: string;
  fact_sheets?: string;
  characters?: string;
  id?: number;
  author_id: number;
  modified?: boolean;
  invalidated?: boolean;
  created_on?: string;
  updated_on?: string;
}
/**
 * If we want to publicly host this, we need a user model.
 *
 * V0 will be single user, so all author keys must be None.
 */
export interface User {
  is_public?: boolean;
  id?: number;
  name: string;
  email: string;
  verified?: boolean;
  social_link?: string;
  patreon_link?: string;
  hashed_password: string;
  superuser?: boolean;
  tokens?: number;
  created_on?: string;
  updated_on?: string;
}
export interface SceneOutlineRead {
  is_public?: boolean;
  chapter_outline_id: number;
  previous_scene_id?: number;
  scene_number: number;
  setting: string;
  primary_function: string;
  secondary_function: string;
  summary: string;
  context: string;
  raw?: string;
  edit_notes?: string;
  improved?: string;
  id: number;
  author_id: number;
  modified: boolean;
  invalidated: boolean;
  created_on: string;
  updated_on: string;
  raw_parsed: SceneOutlineInnerParsed[];
  improved_parsed: SceneOutlineInnerParsed[];
  author: User;
  chapter_outline: ChapterOutline;
  current_scene?: SceneRead;
  previous_scene_outline?: SceneOutlineRead;
  next_scene_outline?: SceneOutlineRead;
}
export interface SceneOutlineInnerParsed {
  scene_number: string;
  content: string;
}
export interface SceneRead {
  is_public?: boolean;
  scene_outline_id: number;
  previous_scene_id?: number;
  scene_number: number;
  outline: string;
  raw?: string;
  edit_notes?: string;
  improved?: string;
  final_text?: string;
  id: number;
  author_id: number;
  modified: boolean;
  invalidated: boolean;
  created_on: string;
  updated_on: string;
  raw_parsed: SceneTextInnerParsed[];
  improved_parsed: SceneTextInnerParsed[];
  raw_text: string;
  improved_text: string;
  author: User;
  scene_outline: SceneOutline;
  previous_scene?: SceneRead;
  next_scene?: SceneRead;
}
export interface SceneTextInnerParsed {
  type: string;
  description: string;
  content: string;
}
export interface SceneOutline {
  is_public?: boolean;
  chapter_outline_id: number;
  previous_scene_id?: number;
  scene_number: number;
  setting: string;
  primary_function: string;
  secondary_function: string;
  summary: string;
  context: string;
  raw?: string;
  edit_notes?: string;
  improved?: string;
  id?: number;
  author_id: number;
  modified?: boolean;
  invalidated?: boolean;
  created_on?: string;
  updated_on?: string;
}
export interface ChapterOutlineReadQueries {
  is_public?: boolean;
  story_outline_id: number;
  previous_chapter_id?: number;
  part_label?: string;
  chapter_number: number;
  title: string;
  purpose: string;
  main_events: string;
  chapter_summary: string;
  chapter_notes: string;
  raw?: string;
  edit_notes?: string;
  improved?: string;
  id: number;
  author_id: number;
  modified: boolean;
  invalidated: boolean;
  created_on: string;
  updated_on: string;
  raw_parsed: ChapterOutlineInnerParsed[];
  improved_parsed: ChapterOutlineInnerParsed[];
  story_outline: StoryOutline;
  author: User;
  current_scene_outlines: SceneOutlineRead[];
  previous_chapter?: ChapterOutlineRead;
  next_chapter?: ChapterOutlineRead;
  queries: QueryRead[];
}
export interface QueryRead {
  is_public?: boolean;
  author_id: number;
  story_id?: number;
  story_outline_id?: number;
  chapter_outline_id?: number;
  scene_outline_id?: number;
  scene_id?: number;
  continues?: number;
  retries?: number;
  original_prompt: string;
  system_prompt: string;
  complete_output: string;
  created_on?: string;
  updated_on?: string;
  id: number;
  total_cost: number;
  previous_messages: Message[];
  all_messages: Message[];
  api_calls: ApiCallRead[];
  linked_obj?: Story | StoryOutline | ChapterOutline | SceneOutline | Scene;
}
export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}
export interface ApiCallRead {
  is_public?: boolean;
  query_id: number;
  timestamp?: string;
  success?: boolean;
  error?: string;
  cost?: number;
  output: string;
  created_on?: string;
  updated_on?: string;
  id: number;
  input_messages: Message[];
}
export interface Story {
  is_public?: boolean;
  title: string;
  description: string;
  style: string;
  themes: string;
  request: string;
  setting?: string;
  main_characters?: string;
  summary?: string;
  id?: number;
  author_id: number;
  raw_tags?: string;
  modified?: boolean;
  modified_generated?: boolean;
  created_on?: string;
  updated_on?: string;
}
export interface Scene {
  is_public?: boolean;
  scene_outline_id: number;
  previous_scene_id?: number;
  scene_number: number;
  outline: string;
  raw?: string;
  edit_notes?: string;
  improved?: string;
  final_text?: string;
  id?: number;
  author_id?: number;
  modified?: boolean;
  invalidated?: boolean;
  created_on?: string;
  updated_on?: string;
}
export interface ChapterOutlineUpdate {
  is_public?: boolean;
  story_outline_id: number;
  previous_chapter_id?: number;
  part_label?: string;
  chapter_number: number;
  title: string;
  purpose: string;
  main_events: string;
  chapter_summary: string;
  chapter_notes: string;
  raw?: string;
  edit_notes?: string;
  improved?: string;
  id: number;
}
export interface Query {
  is_public?: boolean;
  author_id: number;
  story_id?: number;
  story_outline_id?: number;
  chapter_outline_id?: number;
  scene_outline_id?: number;
  scene_id?: number;
  continues?: number;
  retries?: number;
  original_prompt: string;
  system_prompt: string;
  complete_output: string;
  created_on?: string;
  updated_on?: string;
  id?: number;
  previous_messages?: string;
  all_messages?: string;
}
export interface SceneOutlineReadQueries {
  is_public?: boolean;
  chapter_outline_id: number;
  previous_scene_id?: number;
  scene_number: number;
  setting: string;
  primary_function: string;
  secondary_function: string;
  summary: string;
  context: string;
  raw?: string;
  edit_notes?: string;
  improved?: string;
  id: number;
  author_id: number;
  modified: boolean;
  invalidated: boolean;
  created_on: string;
  updated_on: string;
  raw_parsed: SceneOutlineInnerParsed[];
  improved_parsed: SceneOutlineInnerParsed[];
  author: User;
  chapter_outline: ChapterOutline;
  current_scene?: SceneRead;
  previous_scene_outline?: SceneOutlineRead;
  next_scene_outline?: SceneOutlineRead;
  queries: QueryRead[];
}
export interface SceneOutlineUpdate {
  is_public?: boolean;
  chapter_outline_id: number;
  previous_scene_id?: number;
  scene_number: number;
  setting: string;
  primary_function: string;
  secondary_function: string;
  summary: string;
  context: string;
  raw?: string;
  edit_notes?: string;
  improved?: string;
  id: number;
}
export interface SceneReadQueries {
  is_public?: boolean;
  scene_outline_id: number;
  previous_scene_id?: number;
  scene_number: number;
  outline: string;
  raw?: string;
  edit_notes?: string;
  improved?: string;
  final_text?: string;
  id: number;
  author_id: number;
  modified: boolean;
  invalidated: boolean;
  created_on: string;
  updated_on: string;
  raw_parsed: SceneTextInnerParsed[];
  improved_parsed: SceneTextInnerParsed[];
  raw_text: string;
  improved_text: string;
  author: User;
  scene_outline: SceneOutline;
  previous_scene?: SceneRead;
  next_scene?: SceneRead;
  queries: QueryRead[];
}
export interface SceneUpdate {
  is_public?: boolean;
  scene_outline_id: number;
  previous_scene_id?: number;
  scene_number: number;
  outline: string;
  raw?: string;
  edit_notes?: string;
  improved?: string;
  final_text?: string;
  id: number;
}
export interface StoryCreate {
  is_public?: boolean;
  title: string;
  description: string;
  style: string;
  themes: string;
  request: string;
  setting?: string;
  main_characters?: string;
  summary?: string;
}
export interface StoryOutlineRead {
  is_public?: boolean;
  story_id: number;
  outline_onesentence?: string;
  outline_mainevents_raw?: string;
  editing_notes?: string;
  outline_mainevents_improved?: string;
  outline_paragraphs?: string;
  fact_sheets?: string;
  characters?: string;
  id: number;
  author_id: number;
  modified: boolean;
  invalidated: boolean;
  created_on: string;
  updated_on: string;
  outline_onesentence_parsed: SimpleOutlineInnerParsed[];
  outline_mainevents_raw_parsed: MediumOutlineInnerParsed[];
  outline_mainevents_improved_parsed: MediumOutlineInnerParsed[];
  outline_paragraphs_parsed: ComplexOutlineInnerParsed[];
  author: User;
  story: Story;
  current_chapter_outlines: ChapterOutlineRead[];
}
export interface SimpleOutlineInnerParsed {
  chapter_number: string;
  title: string;
  description: string;
}
export interface MediumOutlineInnerParsed {
  part_label: string;
  chapter_number: string;
  title: string;
  chapter_purpose: string;
  main_events: string;
  notes: string;
}
export interface ComplexOutlineInnerParsed {
  part_label: string;
  chapter_number: string;
  title: string;
  chapter_purpose: string;
  chapter_summary: string;
  main_events: string;
  notes: string;
}
export interface StoryOutlineReadQueries {
  is_public?: boolean;
  story_id: number;
  outline_onesentence?: string;
  outline_mainevents_raw?: string;
  editing_notes?: string;
  outline_mainevents_improved?: string;
  outline_paragraphs?: string;
  fact_sheets?: string;
  characters?: string;
  id: number;
  author_id: number;
  modified: boolean;
  invalidated: boolean;
  created_on: string;
  updated_on: string;
  outline_onesentence_parsed: SimpleOutlineInnerParsed[];
  outline_mainevents_raw_parsed: MediumOutlineInnerParsed[];
  outline_mainevents_improved_parsed: MediumOutlineInnerParsed[];
  outline_paragraphs_parsed: ComplexOutlineInnerParsed[];
  author: User;
  story: Story;
  current_chapter_outlines: ChapterOutlineRead[];
  queries: QueryRead[];
}
export interface StoryOutlineUpdate {
  is_public?: boolean;
  story_id: number;
  outline_onesentence?: string;
  outline_mainevents_raw?: string;
  editing_notes?: string;
  outline_mainevents_improved?: string;
  outline_paragraphs?: string;
  fact_sheets?: string;
  characters?: string;
  id: number;
}
export interface StoryRead {
  is_public: boolean;
  title: string;
  description: string;
  style: string;
  themes: string;
  request: string;
  setting?: string;
  main_characters?: string;
  summary?: string;
  id: number;
  author_id: number;
  modified: boolean;
  modified_generated: boolean;
  created_on: string;
  updated_on: string;
  tags: string[];
  author: User;
  current_story_outline?: StoryOutlineRead;
}
export interface StoryReadQueries {
  is_public: boolean;
  title: string;
  description: string;
  style: string;
  themes: string;
  request: string;
  setting?: string;
  main_characters?: string;
  summary?: string;
  id: number;
  author_id: number;
  modified: boolean;
  modified_generated: boolean;
  created_on: string;
  updated_on: string;
  tags: string[];
  author: User;
  current_story_outline?: StoryOutlineRead;
  queries: QueryRead[];
}
export interface StoryReadRecursive {
  is_public: boolean;
  title: string;
  description: string;
  style: string;
  themes: string;
  request: string;
  setting?: string;
  main_characters?: string;
  summary?: string;
  id: number;
  author_id: number;
  modified: boolean;
  modified_generated: boolean;
  created_on: string;
  updated_on: string;
  tags: string[];
  author: User;
  current_story_outline?: StoryOutlineReadRecursive;
}
export interface StoryOutlineReadRecursive {
  is_public?: boolean;
  story_id: number;
  outline_onesentence?: string;
  outline_mainevents_raw?: string;
  editing_notes?: string;
  outline_mainevents_improved?: string;
  outline_paragraphs?: string;
  fact_sheets?: string;
  characters?: string;
  current_chapter_outlines: ChapterOutlineReadRecursive[];
}
export interface ChapterOutlineReadRecursive {
  is_public?: boolean;
  story_outline_id: number;
  previous_chapter_id?: number;
  part_label?: string;
  chapter_number: number;
  title: string;
  purpose: string;
  main_events: string;
  chapter_summary: string;
  chapter_notes: string;
  raw?: string;
  edit_notes?: string;
  improved?: string;
  id: number;
  author_id: number;
  modified: boolean;
  invalidated: boolean;
  created_on: string;
  updated_on: string;
  raw_parsed: ChapterOutlineInnerParsed[];
  improved_parsed: ChapterOutlineInnerParsed[];
  story_outline: StoryOutline;
  author: User;
  current_scene_outlines: SceneOutlineReadRecursive[];
  previous_chapter?: ChapterOutlineRead;
  next_chapter?: ChapterOutlineRead;
}
export interface SceneOutlineReadRecursive {
  is_public?: boolean;
  chapter_outline_id: number;
  previous_scene_id?: number;
  scene_number: number;
  setting: string;
  primary_function: string;
  secondary_function: string;
  summary: string;
  context: string;
  raw?: string;
  edit_notes?: string;
  improved?: string;
  id: number;
  author_id: number;
  modified: boolean;
  invalidated: boolean;
  created_on: string;
  updated_on: string;
  raw_parsed: SceneOutlineInnerParsed[];
  improved_parsed: SceneOutlineInnerParsed[];
  author: User;
  chapter_outline: ChapterOutline;
  current_scene?: SceneRead;
  previous_scene_outline?: SceneOutlineRead;
  next_scene_outline?: SceneOutlineRead;
}
export interface StoryUpdate {
  is_public?: boolean;
  title: string;
  description: string;
  style: string;
  themes: string;
  request: string;
  setting?: string;
  main_characters?: string;
  summary?: string;
  id: number;
}
export interface AccessToken {
  access_token: string;
}
export interface JWTSettings {
  authjwt_secret_key?: string;
}
export interface TokenData {
  email?: string;
}
export interface TokenPair {
  access_token: string;
  refresh_token: string;
}
export interface KeyValue {
  is_public?: boolean;
  id?: number;
  key: string;
  value_str?: string;
  value_int?: number;
  value_bool?: boolean;
  description?: string;
}
export interface VerificationCode {
  is_public?: boolean;
  id?: number;
  code: string;
  user_id: number;
  expires_at?: string;
}
export interface VerificationCodeCreate {
  user_id: number;
  code: string;
}
export interface MidPoint {
  step: number;
  step_name: string;
}
