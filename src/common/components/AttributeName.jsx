import { Tooltip } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

// Name of a position attribute, with an info icon whose tooltip explains what the value
// means when the attribute definition carries a description. Opens on tap on phones too.
const AttributeName = ({ attribute, fallback }) => {
  const name = attribute?.name || fallback;
  if (!attribute?.description) {
    return name;
  }
  return (
    <Tooltip title={attribute.description} enterTouchDelay={0} leaveTouchDelay={5000} arrow>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'help' }}>
        {name}
        <InfoOutlinedIcon sx={{ fontSize: '1em', opacity: 0.7 }} />
      </span>
    </Tooltip>
  );
};

export default AttributeName;
