import { ListItem, ListItemAvatar, ListItemText, Skeleton } from '@mui/material';

// Filas de relleno mientras carga una lista, para que el contenedor nunca se vea vacío.
export default function ListSkeleton({ rows = 6, avatar = true }) {
  return Array.from({ length: rows }, (_, i) => (
    <ListItem key={`skeleton-${i}`} divider>
      {avatar && <ListItemAvatar><Skeleton variant="rounded" width={40} height={40} /></ListItemAvatar>}
      <ListItemText primary={<Skeleton width={`${45 + ((i * 17) % 30)}%`} />} secondary={<Skeleton width={`${25 + ((i * 11) % 20)}%`} />} />
    </ListItem>
  ));
}
