export interface PaginatedResult<T> {
  items: T[];
  hasMore: boolean;
}
