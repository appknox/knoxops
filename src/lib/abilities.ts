import { AbilityBuilder, createMongoAbility, MongoAbility } from '@casl/ability';
import { Role } from '../db/schema/index.js';

type Actions = 'manage' | 'create' | 'read' | 'update' | 'delete';
type Subjects = 'Device' | 'OnPrem' | 'User' | 'AuditLog' | 'Invite' | 'Settings' | 'all';

export type AppAbility = MongoAbility<[Actions, Subjects]>;

export function defineAbilitiesFor(role: Role): AppAbility {
  const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

  switch (role) {
    case 'admin':
      can('manage', 'all');
      break;

    case 'devices_admin':
      can('manage', 'Device');
      can('read', 'AuditLog');
      break;

    case 'devices_viewer':
      can('read', 'Device');
      break;

    case 'onprem_admin':
      can('manage', 'OnPrem');
      can('read', 'AuditLog');
      break;

    case 'onprem_viewer':
      can('read', 'OnPrem');
      break;

    case 'full_viewer':
      can('read', 'Device');
      can('read', 'OnPrem');
      break;

    case 'full_editor':
      can('manage', 'Device');
      can('manage', 'OnPrem');
      can('read', 'AuditLog');
      break;

    default:
      cannot('manage', 'all');
  }

  return build();
}
