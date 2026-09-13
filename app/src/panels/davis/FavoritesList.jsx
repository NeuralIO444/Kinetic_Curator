import * as A from '../../state/actions.js';

export function FavoritesList({ favorites, onDispatch }) {
  if (!favorites || favorites.length === 0) return null;

  return (
    <div className="favorites-list">
      <div className="favorites-header">FAVORITES ({favorites.length})</div>
      {favorites.map((f, i) => (
        <div key={i} className="fav-row">
          <span className="fav-id">#{i + 1}</span>
          <span className="fav-seed">{f.seed.toString(16)}</span>
          <button className="micro-btn" onClick={() => onDispatch({ type: A.RECALL_FAVORITE, favorite: f })}>R</button>
          <button className="micro-btn" onClick={() => onDispatch({ type: A.REMOVE_FAVORITE, index: i })}>X</button>
        </div>
      ))}
    </div>
  );
}
