import { Tooltip } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useAdministrator } from '../util/permissions';

// Name of a position attribute, with an info icon whose tooltip explains what the value
// means when the attribute definition carries a description. Opens on tap on phones too.
// The explanation is for our staff only: clients see the plain name.
const AttributeName = ({ attribute, fallback }) => {
  const admin = useAdministrator();
  const name = attribute?.name || fallback;
  if (!admin || !attribute?.description) {
    return name;
  }
  return (
    <Tooltip title={attribute.description} enterTouchDelay={0} leaveTouchDelay={5000} arrow>
      <span style={{ cursor: 'help' }}>
        {name}
        <InfoOutlinedIcon
          sx={{ fontSize: '1em', opacity: 0.7, ml: 0.5, verticalAlign: 'middle' }}
        />
      </span>
    </Tooltip>
  );
};

export default AttributeName;
