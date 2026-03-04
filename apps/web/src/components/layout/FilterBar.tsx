import { Box, Paper, TextField, Autocomplete } from '@mui/material';
import { useFilterStore } from '../../store/filter.store';
import { useOrganizations } from '../../hooks/useOrganizations';
import { useRepositories } from '../../hooks/useRepositories';
import type { Organization } from '../../api/organizations/organizations.types';
import type { Repository } from '../../api/repositories/repositories.types';

export function FilterBar() {
  const { organizationId, fromDate, toDate, repositoryIds, setOrganizationId, setDateRange, setRepositoryIds } = useFilterStore();
  const { data: organizations } = useOrganizations();
  const { data: repositories } = useRepositories(organizationId);

  const orgOptions: Organization[] = organizations ?? [];
  const selectedOrg = orgOptions.find((o) => o.id === organizationId) ?? null;

  const repoOptions: Repository[] = repositories ?? [];
  const selectedRepos = repoOptions.filter((r) => repositoryIds.includes(r.id));

  return (
    <Paper
      elevation={0}
      sx={{
        position: 'sticky',
        top: 64,
        zIndex: (theme) => theme.zIndex.appBar - 1,
        borderBottom: '1px solid',
        borderColor: 'divider',
        borderRadius: 0,
      }}
    >
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', px: 3, py: 1.5 }}>
        <Autocomplete
          size="small"
          options={orgOptions}
          getOptionLabel={(option) => option.login}
          isOptionEqualToValue={(option, value) => option.id === value.id}
          value={selectedOrg}
          onChange={(_event, newValue) => setOrganizationId(newValue?.id ?? null)}
          renderInput={(params) => (
            <TextField {...params} label="Organization" placeholder="All organizations" />
          )}
          sx={{ minWidth: 200 }}
        />
        <TextField
          label="From"
          type="date"
          size="small"
          value={fromDate ?? ''}
          onChange={(e) => setDateRange(e.target.value || null, toDate)}
          slotProps={{
            inputLabel: { shrink: true },
            htmlInput: { max: toDate ?? undefined },
          }}
          sx={{ minWidth: 160 }}
        />
        <TextField
          label="To"
          type="date"
          size="small"
          value={toDate ?? ''}
          onChange={(e) => setDateRange(fromDate, e.target.value || null)}
          slotProps={{
            inputLabel: { shrink: true },
            htmlInput: { min: fromDate ?? undefined },
          }}
          sx={{ minWidth: 160 }}
        />
        <Autocomplete
          multiple
          size="small"
          options={repoOptions}
          getOptionLabel={(option) => option.name}
          isOptionEqualToValue={(option, value) => option.id === value.id}
          value={selectedRepos}
          onChange={(_event, newValue) => setRepositoryIds(newValue.map((r) => r.id))}
          renderInput={(params) => (
            <TextField {...params} label="Repositories" placeholder="All repositories" />
          )}
          sx={{ flex: 1, minWidth: 200 }}
        />
      </Box>
    </Paper>
  );
}
