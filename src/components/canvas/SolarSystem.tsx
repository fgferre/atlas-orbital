import { SOLAR_SYSTEM_BODIES } from '../../lib/astrophysics';
import { Planet } from './Planet';

export const SolarSystem = () => {
  // Group bodies by parentId
  const bodiesByParent = SOLAR_SYSTEM_BODIES.reduce((acc, body) => {
    const pid = body.parentId || 'root';
    if (!acc[pid]) acc[pid] = [];
    acc[pid].push(body);
    return acc;
  }, {} as Record<string, typeof SOLAR_SYSTEM_BODIES>);

  const renderBody = (id: string) => {
    const bodies = bodiesByParent[id];
    if (!bodies) return null;
    
    return bodies.map(body => (
      <Planet key={body.id} body={body}>
        {renderBody(body.id)}
      </Planet>
    ));
  };

  return (
    <group>
      {renderBody('root')}
    </group>
  );
};
