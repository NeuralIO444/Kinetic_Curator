import { emit, Events } from '../../composition/eventBus.js';

export function FavoritesList({ favorites }) {
  if (!favorites || favorites.length === 0) return null;

  return (
    <div className="favorites-list">
      <div className="favorites-header">FAVORITES ({favorites.length})</div>
      {favorites.map((f, i) => (
        <div key={f.id} className="fav-row">
          <span className="fav-id">#{i + 1}</span>
          <span className="fav-seed">{f.seed.toString(16)}</span>
          <button className="micro-btn" onClick={() => emit(Events.DAVIS_FAVORITE, { action: 'recall', favorite: f })}>R</button>
          <button className="micro-btn" onClick={() => emit(Events.DAVIS_FAVORITE_REMOVE, { id: f.id })}>X</button>
        </div>
      ))}
    </div>
  );
}
