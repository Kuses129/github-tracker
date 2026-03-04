import type { ReactNode } from 'react';
import { Box, Card, CardContent, Typography } from '@mui/material';

interface ComingSoonPageProps {
  title: string;
  subtitle: string;
  description: string;
  icon: ReactNode;
}

export function ComingSoonPage({ title, subtitle, description, icon }: ComingSoonPageProps) {
  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5">{title}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {subtitle}
        </Typography>
      </Box>
      <Card>
        <CardContent sx={{ py: 6, textAlign: 'center' }}>
          {icon}
          <Typography variant="subtitle1" color="text.secondary" gutterBottom>
            Coming soon
          </Typography>
          <Typography variant="body2" color="text.disabled">
            {description}
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
