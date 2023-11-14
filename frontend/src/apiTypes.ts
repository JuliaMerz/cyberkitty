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
}
export interface ChapterOutline {
  is_public?: boolean;
  author_id: number;
  story_outline_id: number;
  previous_chapter_id?: number;
  chapter_number: number;
  title: string;
  purpose: string;
  main_events: string;
  paragraph_summary: string;
  chapter_notes: string;
  raw?: string;
  edit_notes?: string;
  improved?: string;
  id?: number;
  modified?: boolean;
  invalidated?: boolean;
  created_on?: string;
  updated_on?: string;
}
export interface ChapterOutlineRead {
  is_public: boolean;
  author_id: number;
  story_outline_id: number;
  previous_chapter_id?: number;
  chapter_number: number;
  title: string;
  purpose: string;
  main_events: string;
  paragraph_summary: string;
  chapter_notes: string;
  raw?: string;
  edit_notes?: string;
  improved?: string;
  id: number;
  modified: boolean;
  invalidated: boolean;
  created_on: string;
  updated_on: string;
  raw_parsed: ChapterOutlineInnerParsed[];
  improved_parsed: ChapterOutlineInnerParsed[];
  story_outline: StoryOutline;
  author: User;
  all_scene_outlines: SceneOutlineRead[];
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
  author_id: number;
  story_id: number;
  outline_onesentence?: string;
  outline_mainevents_raw?: string;
  editing_notes?: string;
  outline_mainevents_improved?: string;
  outline_paragraphs?: string;
  fact_sheets?: string;
  characters?: string;
  id?: number;
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
  hashed_password: string;
  superuser?: boolean;
  tokens?: number;
  created_on?: string;
  updated_on?: string;
}
export interface SceneOutlineRead {
  is_public: boolean;
  author_id: number;
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
  modified: boolean;
  invalidated: boolean;
  created_on: string;
  updated_on: string;
  raw_parsed: SceneOutlineInnerParsed[];
  improved_parsed: SceneOutlineInnerParsed[];
  author: User;
  chapter_outline: ChapterOutline;
  all_scenes: SceneRead[];
  current_scene?: SceneRead;
  previous_scene_outline?: SceneOutlineRead;
  next_scene_outline?: SceneOutlineRead;
}
export interface SceneOutlineInnerParsed {
  scene_number: string;
  content: string;
}
export interface SceneRead {
  is_public: boolean;
  author_id?: number;
  scene_outline_id: number;
  previous_scene_id?: number;
  scene_number: number;
  raw?: string;
  edit_notes?: string;
  improved?: string;
  id: number;
  modified: boolean;
  invalidated: boolean;
  created_on: string;
  updated_on: string;
  raw_parsed: {
    [k: string]: unknown;
  };
  improved_parsed: {
    [k: string]: unknown;
  };
  raw_text: string;
  improved_text: string;
  author: User;
  scene_outline: SceneOutline;
  previous_scene?: SceneRead;
  next_scene?: SceneRead;
}
export interface SceneOutline {
  is_public?: boolean;
  author_id: number;
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
  modified?: boolean;
  invalidated?: boolean;
  created_on?: string;
  updated_on?: string;
}
export interface ChapterOutlineUpdate {
  is_public?: boolean;
  author_id: number;
  story_outline_id: number;
  previous_chapter_id?: number;
  chapter_number: number;
  title: string;
  purpose: string;
  main_events: string;
  paragraph_summary: string;
  chapter_notes: string;
  raw?: string;
  edit_notes?: string;
  improved?: string;
  id: number;
}
export interface Query {
  is_public?: boolean;
  author_id: number;
  continues?: number;
  retries?: number;
  original_prompt: string;
  complete_output: string;
  created_on?: string;
  updated_on?: string;
  id?: number;
}
export interface QueryRead {
  is_public?: boolean;
  author_id: number;
  continues?: number;
  retries?: number;
  original_prompt: string;
  complete_output: string;
  created_on?: string;
  updated_on?: string;
  id: number;
  total_cost: number;
  previous_messages: Message[];
  all_messages: Message[];
  api_calls: ApiCallRead[];
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
export interface Scene {
  is_public?: boolean;
  author_id?: number;
  scene_outline_id: number;
  previous_scene_id?: number;
  scene_number: number;
  raw?: string;
  edit_notes?: string;
  improved?: string;
  id?: number;
  modified?: boolean;
  invalidated?: boolean;
  created_on?: string;
  updated_on?: string;
}
export interface SceneOutlineUpdate {
  is_public?: boolean;
  author_id: number;
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
export interface SceneUpdate {
  is_public?: boolean;
  author_id?: number;
  scene_outline_id: number;
  previous_scene_id?: number;
  scene_number: number;
  raw?: string;
  edit_notes?: string;
  improved?: string;
  id: number;
}
export interface Story {
  is_public?: boolean;
  title: string;
  author_id: number;
  description: string;
  style: string;
  themes: string;
  setting?: string;
  main_characters?: string;
  summary?: string;
  id?: number;
  modified?: boolean;
  created_on?: string;
  updated_on?: string;
}
export interface StoryOutlineRead {
  is_public: boolean;
  author_id: number;
  story_id: number;
  outline_onesentence?: string;
  outline_mainevents_raw?: string;
  editing_notes?: string;
  outline_mainevents_improved?: string;
  outline_paragraphs?: string;
  fact_sheets?: string;
  characters?: string;
  id: number;
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
  all_chapter_outlines: ChapterOutlineRead[];
  current_chapter_outlines: ChapterOutlineRead[];
}
export interface SimpleOutlineInnerParsed {
  chapter_number: string;
  title: string;
  description: string;
}
export interface MediumOutlineInnerParsed {
  chapter_number: string;
  title: string;
  chapter_purpose: string;
  main_events: string;
  notes: string;
}
export interface ComplexOutlineInnerParsed {
  chapter_number: string;
  title: string;
  chapter_purpose: string;
  chapter_summary: string;
  main_events: string;
  notes: string;
}
export interface StoryOutlineUpdate {
  is_public?: boolean;
  author_id: number;
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
  author_id: number;
  description: string;
  style: string;
  themes: string;
  setting?: string;
  main_characters?: string;
  summary?: string;
  id: number;
  modified: boolean;
  created_on: string;
  updated_on: string;
  tags: string[];
  author: User;
  all_story_outlines: StoryOutlineRead[];
  current_story_outline?: StoryOutlineRead;
}
export interface StoryReadRecursive {
  is_public?: boolean;
  title: string;
  author_id: number;
  description: string;
  style: string;
  themes: string;
  setting?: string;
  main_characters?: string;
  summary?: string;
  current_story_outline?: StoryOutlineReadRecursive;
}
export interface StoryOutlineReadRecursive {
  is_public?: boolean;
  author_id: number;
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
  is_public: boolean;
  author_id: number;
  story_outline_id: number;
  previous_chapter_id?: number;
  chapter_number: number;
  title: string;
  purpose: string;
  main_events: string;
  paragraph_summary: string;
  chapter_notes: string;
  raw?: string;
  edit_notes?: string;
  improved?: string;
  id: number;
  modified: boolean;
  invalidated: boolean;
  created_on: string;
  updated_on: string;
  raw_parsed: ChapterOutlineInnerParsed[];
  improved_parsed: ChapterOutlineInnerParsed[];
  story_outline: StoryOutline;
  author: User;
  all_scene_outlines: SceneOutlineRead[];
  current_scene_outlines: SceneOutlineReadRecursive[];
  previous_chapter?: ChapterOutlineRead;
  next_chapter?: ChapterOutlineRead;
}
export interface SceneOutlineReadRecursive {
  is_public: boolean;
  author_id: number;
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
  modified: boolean;
  invalidated: boolean;
  created_on: string;
  updated_on: string;
  raw_parsed: SceneOutlineInnerParsed[];
  improved_parsed: SceneOutlineInnerParsed[];
  author: User;
  chapter_outline: ChapterOutline;
  all_scenes: SceneRead[];
  current_scene?: SceneRead;
  previous_scene_outline?: SceneOutlineRead;
  next_scene_outline?: SceneOutlineRead;
}
export interface StoryUpdate {
  is_public?: boolean;
  title: string;
  author_id: number;
  description: string;
  style: string;
  themes: string;
  setting?: string;
  main_characters?: string;
  summary?: string;
  id: number;
}
export interface Token {
  access_token: string;
  token_type: string;
}
export interface TokenData {
  email?: string;
}
